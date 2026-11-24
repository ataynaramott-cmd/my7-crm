-- MY7 CRM — closer, ganhos, contratos, anúncios (Meta Ads) e sincronização
BEGIN;

-- ============ PAPÉIS ============
ALTER TABLE public.user_roles DROP CONSTRAINT IF EXISTS user_roles_role_check;
ALTER TABLE public.user_roles ADD CONSTRAINT user_roles_role_check CHECK (role IN ('admin','sdr','closer'));

CREATE OR REPLACE FUNCTION public.is_team_member(uid uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(uid, 'admin')
    OR ((public.has_role(uid, 'sdr') OR public.has_role(uid, 'closer'))
        AND EXISTS (SELECT 1 FROM public.profiles WHERE id = uid AND ativo))
$$;

CREATE OR REPLACE FUNCTION public.papel_de(uid uuid)
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT CASE WHEN public.has_role(uid,'admin') THEN 'admin'
              WHEN public.has_role(uid,'closer') THEN 'closer'
              WHEN public.has_role(uid,'sdr') THEN 'sdr' ELSE NULL END
$$;

-- quem pode ver/editar um lead: admin tudo; closer só os seus; SDR os seus + sem responsável
CREATE OR REPLACE FUNCTION public.pode_ver_lead(p_resp uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT public.has_role(auth.uid(), 'admin')
    OR (public.is_team_member(auth.uid())
        AND (p_resp = auth.uid() OR (p_resp IS NULL AND public.has_role(auth.uid(), 'sdr'))))
$$;

DROP POLICY IF EXISTS "Equipe le leads" ON public.leads;
DROP POLICY IF EXISTS "Equipe edita leads" ON public.leads;
CREATE POLICY "Equipe le leads" ON public.leads FOR SELECT TO authenticated USING (public.pode_ver_lead(responsavel_id));
CREATE POLICY "Equipe edita leads" ON public.leads FOR UPDATE TO authenticated
  USING (public.pode_ver_lead(responsavel_id)) WITH CHECK (public.pode_ver_lead(responsavel_id));

-- atividades: cada um sempre vê as próprias (métricas não somem depois da passagem para o closer)
DROP POLICY IF EXISTS "Equipe ve atividades" ON public.atividades;
CREATE POLICY "Equipe ve atividades" ON public.atividades FOR SELECT TO authenticated USING (
  public.has_role(auth.uid(), 'admin')
  OR (public.is_team_member(auth.uid()) AND (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.leads l WHERE l.id = atividades.lead_id)))
);

-- ============ LEADS: passagem SDR -> closer e fechamento ============
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS sdr_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS closer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS reuniao_em timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS passado_closer_em timestamptz;
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS valor_fechado numeric(12,2);
ALTER TABLE public.leads ADD COLUMN IF NOT EXISTS fechado_em timestamptz;

CREATE OR REPLACE FUNCTION public.leads_before_update()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'admin')
     AND coalesce(current_setting('my7.rpc', true), '') <> '1' THEN
    NEW.score := OLD.score;
    NEW.classe := OLD.classe;
    NEW.sdr_id := OLD.sdr_id; NEW.closer_id := OLD.closer_id;
    NEW.valor_fechado := OLD.valor_fechado; NEW.fechado_em := OLD.fechado_em;
    IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id
       AND NOT (OLD.responsavel_id IS NULL AND NEW.responsavel_id = auth.uid()) THEN
      NEW.responsavel_id := OLD.responsavel_id;
    END IF;
  END IF;
  IF NEW.responsavel_id IS DISTINCT FROM OLD.responsavel_id THEN
    NEW.assumido_em := CASE WHEN NEW.responsavel_id IS NULL THEN NULL ELSE now() END;
  END IF;
  IF NEW.status IS DISTINCT FROM OLD.status THEN
    NEW.status_alterado_em := now();
    IF OLD.status = 'lista_fria' THEN NEW.reativado_em := now(); END IF;
  END IF;
  RETURN NEW;
END $function$;

CREATE OR REPLACE FUNCTION public.passar_para_closer(p_lead uuid, p_closer uuid, p_quando timestamptz, p_obs text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  l public.leads%ROWTYPE;
  v_closer text;
BEGIN
  IF uid IS NULL OR NOT public.is_team_member(uid) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO l FROM public.leads WHERE id = p_lead;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;
  IF NOT (public.has_role(uid,'admin') OR l.responsavel_id = uid OR (l.responsavel_id IS NULL AND public.has_role(uid,'sdr'))) THEN
    RAISE EXCEPTION 'Esse lead não está com você';
  END IF;
  IF NOT ((public.has_role(p_closer,'closer') OR public.has_role(p_closer,'admin'))
          AND EXISTS (SELECT 1 FROM public.profiles WHERE id = p_closer AND ativo)) THEN
    RAISE EXCEPTION 'Escolha um closer ativo';
  END IF;
  SELECT nome INTO v_closer FROM public.profiles WHERE id = p_closer;
  PERFORM set_config('my7.rpc', '1', true);
  INSERT INTO public.atividades (lead_id, user_id, tipo, resultado, descricao)
  VALUES (p_lead, uid, 'reuniao_agendada', NULL,
    left('Reunião ' || coalesce(to_char(p_quando AT TIME ZONE 'America/Sao_Paulo', 'DD/MM "às" HH24:MI'), 'a combinar')
         || ' · passado para ' || coalesce(v_closer, 'closer')
         || coalesce(' · ' || nullif(trim(p_obs), ''), ''), 2000));
  UPDATE public.leads SET
    status = 'reuniao',
    sdr_id = coalesce(l.sdr_id, CASE WHEN public.has_role(uid,'sdr') THEN uid ELSE l.responsavel_id END, uid),
    closer_id = p_closer,
    responsavel_id = p_closer,
    reuniao_em = p_quando,
    passado_closer_em = now()
  WHERE id = p_lead;
END $$;

-- ============ GANHOS ============
CREATE TABLE IF NOT EXISTS public.ganhos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL CHECK (char_length(cliente_nome) BETWEEN 1 AND 160),
  valor numeric(12,2) NOT NULL CHECK (valor > 0 AND valor < 100000000),
  recorrencia text NOT NULL DEFAULT 'mensal' CHECK (recorrencia IN ('mensal','unico')),
  meses int CHECK (meses IS NULL OR meses BETWEEN 1 AND 120),
  data_fechamento date NOT NULL DEFAULT (now() AT TIME ZONE 'America/Sao_Paulo')::date,
  vendedor_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sdr_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  descricao text CHECK (descricao IS NULL OR char_length(descricao) <= 1000),
  created_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);
CREATE INDEX IF NOT EXISTS ganhos_data_idx ON public.ganhos (data_fechamento DESC);
ALTER TABLE public.ganhos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin gerencia ganhos" ON public.ganhos;
CREATE POLICY "Admin gerencia ganhos" ON public.ganhos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
REVOKE ALL ON public.ganhos FROM anon;

-- ============ CONTRATOS ============
CREATE TABLE IF NOT EXISTS public.contratos (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  lead_id uuid REFERENCES public.leads(id) ON DELETE SET NULL,
  ganho_id uuid REFERENCES public.ganhos(id) ON DELETE SET NULL,
  cliente_nome text NOT NULL CHECK (char_length(cliente_nome) BETWEEN 1 AND 160),
  documento text CHECK (documento IS NULL OR char_length(documento) <= 40),
  contato_nome text CHECK (contato_nome IS NULL OR char_length(contato_nome) <= 160),
  email text CHECK (email IS NULL OR char_length(email) <= 200),
  telefone text CHECK (telefone IS NULL OR char_length(telefone) <= 40),
  servicos text CHECK (servicos IS NULL OR char_length(servicos) <= 2000),
  valor_mensal numeric(12,2) CHECK (valor_mensal IS NULL OR valor_mensal >= 0),
  valor_setup numeric(12,2) CHECK (valor_setup IS NULL OR valor_setup >= 0),
  data_inicio date,
  duracao_meses int CHECK (duracao_meses IS NULL OR duracao_meses BETWEEN 1 AND 120),
  dia_vencimento int CHECK (dia_vencimento IS NULL OR dia_vencimento BETWEEN 1 AND 31),
  forma_pagamento text CHECK (forma_pagamento IS NULL OR char_length(forma_pagamento) <= 60),
  status text NOT NULL DEFAULT 'pendente' CHECK (status IN ('pendente','enviado','assinado','ativo','encerrado','cancelado')),
  link_contrato text CHECK (link_contrato IS NULL OR (link_contrato ~ '^https://' AND char_length(link_contrato) <= 1000)),
  observacoes text CHECK (observacoes IS NULL OR char_length(observacoes) <= 5000),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  created_by uuid DEFAULT auth.uid()
);
ALTER TABLE public.contratos ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin gerencia contratos" ON public.contratos;
CREATE POLICY "Admin gerencia contratos" ON public.contratos FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
REVOKE ALL ON public.contratos FROM anon;
CREATE OR REPLACE FUNCTION public.touch_updated_at() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN NEW.updated_at := now(); RETURN NEW; END $$;
DROP TRIGGER IF EXISTS contratos_touch ON public.contratos;
CREATE TRIGGER contratos_touch BEFORE UPDATE ON public.contratos FOR EACH ROW EXECUTE FUNCTION public.touch_updated_at();

CREATE OR REPLACE FUNCTION public.registrar_ganho(p_lead uuid, p_valor numeric, p_recorrencia text, p_meses int, p_data date, p_desc text DEFAULT NULL)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  uid uuid := auth.uid();
  l public.leads%ROWTYPE;
  g uuid;
BEGIN
  IF uid IS NULL OR NOT public.is_team_member(uid) THEN RAISE EXCEPTION 'Sem permissão'; END IF;
  SELECT * INTO l FROM public.leads WHERE id = p_lead;
  IF NOT FOUND THEN RAISE EXCEPTION 'Lead não encontrado'; END IF;
  IF NOT (public.has_role(uid,'admin') OR l.responsavel_id = uid OR (l.responsavel_id IS NULL AND public.has_role(uid,'sdr'))) THEN
    RAISE EXCEPTION 'Esse lead não está com você';
  END IF;
  IF p_valor IS NULL OR p_valor <= 0 THEN RAISE EXCEPTION 'Informe o valor do fechamento'; END IF;
  IF p_recorrencia NOT IN ('mensal','unico') THEN RAISE EXCEPTION 'Tipo inválido'; END IF;
  PERFORM set_config('my7.rpc', '1', true);
  INSERT INTO public.ganhos (lead_id, cliente_nome, valor, recorrencia, meses, data_fechamento, vendedor_id, sdr_id, descricao, created_by)
  VALUES (p_lead, l.nome, round(p_valor, 2), p_recorrencia, p_meses,
          coalesce(p_data, (now() AT TIME ZONE 'America/Sao_Paulo')::date), uid, l.sdr_id, nullif(trim(p_desc), ''), uid)
  RETURNING id INTO g;
  UPDATE public.leads SET status = 'fechado', valor_fechado = round(p_valor, 2),
    fechado_em = coalesce(p_data::timestamptz + interval '12 hours', now())
  WHERE id = p_lead;
  INSERT INTO public.atividades (lead_id, user_id, tipo, resultado, descricao)
  VALUES (p_lead, uid, 'nota', NULL, left('🏆 Fechado: R$ ' || to_char(p_valor, 'FM999G999G990D00') || CASE WHEN p_recorrencia = 'mensal' THEN '/mês' ELSE ' (único)' END || coalesce(' · ' || nullif(trim(p_desc), ''), ''), 2000));
  INSERT INTO public.contratos (lead_id, ganho_id, cliente_nome, telefone, valor_mensal, valor_setup, duracao_meses, status, created_by)
  VALUES (p_lead, g, l.nome, l.whatsapp, CASE WHEN p_recorrencia = 'mensal' THEN round(p_valor, 2) END,
          CASE WHEN p_recorrencia = 'unico' THEN round(p_valor, 2) END, p_meses, 'pendente', uid);
  RETURN g;
END $$;

-- ============ EQUIPE ============
CREATE OR REPLACE FUNCTION public.listar_equipe()
RETURNS TABLE(id uuid, nome text, email text, ativo boolean, papel text, created_at timestamptz)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $function$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  RETURN QUERY SELECT p.id, p.nome, p.email, p.ativo, coalesce(public.papel_de(p.id), 'pendente'), p.created_at
    FROM public.profiles p ORDER BY p.created_at;
END $function$;

CREATE OR REPLACE FUNCTION public.definir_papel(p_user uuid, p_papel text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  IF p_papel NOT IN ('sdr','closer') THEN RAISE EXCEPTION 'Papel inválido'; END IF;
  IF public.has_role(p_user, 'admin') THEN RAISE EXCEPTION 'Administradores não mudam de papel por aqui'; END IF;
  DELETE FROM public.user_roles WHERE user_id = p_user AND role IN ('sdr','closer');
  INSERT INTO public.user_roles (user_id, role) VALUES (p_user, p_papel);
  UPDATE public.profiles SET ativo = true WHERE id = p_user;
END $$;
REVOKE ALL ON FUNCTION public.definir_papel(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.definir_papel(uuid, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.listar_closers()
RETURNS TABLE(id uuid, nome text, papel text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT p.id, p.nome, public.papel_de(p.id) FROM public.profiles p
  WHERE public.is_team_member(auth.uid())
    AND p.ativo AND (public.has_role(p.id,'closer') OR public.has_role(p.id,'admin'))
  ORDER BY public.has_role(p.id,'admin'), p.nome
$$;

-- ============ ANÚNCIOS ============
CREATE TABLE IF NOT EXISTS public.ads_metricas (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  data date NOT NULL,
  plataforma text NOT NULL DEFAULT 'meta' CHECK (plataforma IN ('meta','google','outro')),
  conta_id text NOT NULL DEFAULT '',
  campaign_id text NOT NULL DEFAULT '',
  campaign_name text,
  spend numeric(12,2) NOT NULL DEFAULT 0 CHECK (spend >= 0),
  impressions bigint NOT NULL DEFAULT 0,
  clicks bigint NOT NULL DEFAULT 0,
  leads_plataforma int NOT NULL DEFAULT 0,
  conversas int NOT NULL DEFAULT 0,
  origem text NOT NULL DEFAULT 'manual' CHECK (origem IN ('api','manual')),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (plataforma, conta_id, campaign_id, data)
);
ALTER TABLE public.ads_metricas ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin gerencia anuncios" ON public.ads_metricas;
CREATE POLICY "Admin gerencia anuncios" ON public.ads_metricas FOR ALL TO authenticated
  USING (public.has_role(auth.uid(),'admin')) WITH CHECK (public.has_role(auth.uid(),'admin'));
REVOKE ALL ON public.ads_metricas FROM anon;

CREATE TABLE IF NOT EXISTS public.integracoes (
  id text PRIMARY KEY CHECK (id IN ('meta')),
  conta_id text,
  api_version text NOT NULL DEFAULT 'v26.0',
  ativo boolean NOT NULL DEFAULT false,
  token_secret_id uuid,
  tem_token boolean NOT NULL DEFAULT false,
  ultima_sync timestamptz,
  ultimo_status text,
  ultimo_erro text,
  atualizado_em timestamptz NOT NULL DEFAULT now()
);
ALTER TABLE public.integracoes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin le integracoes" ON public.integracoes;
CREATE POLICY "Admin le integracoes" ON public.integracoes FOR SELECT TO authenticated USING (public.has_role(auth.uid(),'admin'));
REVOKE ALL ON public.integracoes FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.integracoes FROM authenticated;
INSERT INTO public.integracoes (id) VALUES ('meta') ON CONFLICT DO NOTHING;

CREATE TABLE IF NOT EXISTS public.integracoes_fila (
  request_id bigint PRIMARY KEY,
  integracao text NOT NULL DEFAULT 'meta',
  criado_em timestamptz NOT NULL DEFAULT now(),
  processado boolean NOT NULL DEFAULT false
);
ALTER TABLE public.integracoes_fila ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.integracoes_fila FROM anon, authenticated;

-- salva conta + token (o token vai para o cofre criptografado e nunca volta para a tela)
CREATE OR REPLACE FUNCTION public.salvar_meta_config(p_conta text, p_token text DEFAULT NULL, p_ativo boolean DEFAULT true)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_conta text := regexp_replace(coalesce(p_conta, ''), '[^0-9]', '', 'g');
  v_sid uuid;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  IF v_conta = '' THEN RAISE EXCEPTION 'Informe o ID da conta de anúncios (só números)'; END IF;
  SELECT token_secret_id INTO v_sid FROM public.integracoes WHERE id = 'meta';
  IF p_token IS NOT NULL AND trim(p_token) <> '' THEN
    IF v_sid IS NULL THEN
      v_sid := vault.create_secret(trim(p_token), 'meta_ads_token_' || gen_random_uuid()::text, 'Token Meta Ads do CRM MY7');
    ELSE
      PERFORM vault.update_secret(v_sid, trim(p_token));
    END IF;
  END IF;
  UPDATE public.integracoes SET conta_id = v_conta, ativo = coalesce(p_ativo, true), token_secret_id = v_sid,
    tem_token = v_sid IS NOT NULL, atualizado_em = now(), ultimo_erro = NULL WHERE id = 'meta';
END $$;
REVOKE ALL ON FUNCTION public.salvar_meta_config(text, text, boolean) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.salvar_meta_config(text, text, boolean) TO authenticated;

-- dispara a busca na API da Meta (resposta chega de forma assíncrona)
CREATE OR REPLACE FUNCTION public.meta_sync_start(p_dias int DEFAULT 30)
RETURNS bigint LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  c public.integracoes%ROWTYPE;
  v_token text;
  v_req bigint;
  v_hoje date := (now() AT TIME ZONE 'America/Sao_Paulo')::date;
BEGIN
  SELECT * INTO c FROM public.integracoes WHERE id = 'meta';
  IF NOT FOUND OR NOT c.ativo OR c.token_secret_id IS NULL OR coalesce(c.conta_id, '') = '' THEN RETURN NULL; END IF;
  SELECT decrypted_secret INTO v_token FROM vault.decrypted_secrets WHERE id = c.token_secret_id;
  IF v_token IS NULL THEN RETURN NULL; END IF;
  SELECT net.http_get(
    url := 'https://graph.facebook.com/' || c.api_version || '/act_' || c.conta_id || '/insights',
    params := jsonb_build_object(
      'level', 'campaign',
      'fields', 'campaign_id,campaign_name,spend,impressions,clicks,actions',
      'time_increment', '1',
      'time_range', json_build_object('since', to_char(v_hoje - greatest(1, least(p_dias, 365)), 'YYYY-MM-DD'), 'until', to_char(v_hoje, 'YYYY-MM-DD'))::text,
      'limit', '500',
      'access_token', v_token),
    timeout_milliseconds := 30000) INTO v_req;
  INSERT INTO public.integracoes_fila (request_id) VALUES (v_req);
  UPDATE public.integracoes SET ultimo_status = 'buscando' WHERE id = 'meta';
  RETURN v_req;
END $$;
REVOKE ALL ON FUNCTION public.meta_sync_start(int) FROM public, anon, authenticated;

-- lê as respostas, grava as métricas e segue a paginação
CREATE OR REPLACE FUNCTION public.meta_sync_collect()
RETURNS int LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  f record; r record; j jsonb; row jsonb; n int := 0; v_conta text; v_next text; v_leads int; v_conv int;
BEGIN
  SELECT conta_id INTO v_conta FROM public.integracoes WHERE id = 'meta';
  FOR f IN SELECT * FROM public.integracoes_fila WHERE NOT processado ORDER BY request_id LOOP
    SELECT * INTO r FROM net._http_response WHERE id = f.request_id;
    IF NOT FOUND THEN
      IF f.criado_em < now() - interval '15 minutes' THEN
        UPDATE public.integracoes_fila SET processado = true WHERE request_id = f.request_id;
        UPDATE public.integracoes SET ultimo_status = 'erro', ultimo_erro = 'A Meta não respondeu a tempo' WHERE id = 'meta';
      END IF;
      CONTINUE;
    END IF;
    UPDATE public.integracoes_fila SET processado = true WHERE request_id = f.request_id;
    BEGIN j := r.content::jsonb; EXCEPTION WHEN others THEN j := NULL; END;
    IF r.timed_out OR r.status_code IS DISTINCT FROM 200 OR j IS NULL THEN
      UPDATE public.integracoes SET ultimo_status = 'erro',
        ultimo_erro = left(coalesce(j #>> '{error,message}', r.error_msg, 'Erro HTTP ' || coalesce(r.status_code::text, '?')), 500)
      WHERE id = 'meta';
      CONTINUE;
    END IF;
    FOR row IN SELECT * FROM jsonb_array_elements(coalesce(j->'data', '[]'::jsonb)) LOOP
      SELECT
        coalesce(
          max(CASE WHEN a->>'action_type' = 'lead' THEN (a->>'value')::numeric END),
          sum(CASE WHEN a->>'action_type' IN ('onsite_conversion.lead_grouped','offsite_conversion.fb_pixel_lead') THEN (a->>'value')::numeric END),
          0)::int,
        coalesce(sum(CASE WHEN a->>'action_type' = 'onsite_conversion.messaging_conversation_started_7d' THEN (a->>'value')::numeric END), 0)::int
      INTO v_leads, v_conv
      FROM jsonb_array_elements(coalesce(row->'actions', '[]'::jsonb)) a;
      INSERT INTO public.ads_metricas (data, plataforma, conta_id, campaign_id, campaign_name, spend, impressions, clicks, leads_plataforma, conversas, origem, updated_at)
      VALUES ((row->>'date_start')::date, 'meta', coalesce(v_conta, ''), coalesce(row->>'campaign_id', ''), row->>'campaign_name',
        coalesce((row->>'spend')::numeric, 0), coalesce((row->>'impressions')::bigint, 0), coalesce((row->>'clicks')::bigint, 0),
        v_leads, v_conv, 'api', now())
      ON CONFLICT (plataforma, conta_id, campaign_id, data) DO UPDATE SET
        campaign_name = EXCLUDED.campaign_name, spend = EXCLUDED.spend, impressions = EXCLUDED.impressions,
        clicks = EXCLUDED.clicks, leads_plataforma = EXCLUDED.leads_plataforma, conversas = EXCLUDED.conversas,
        origem = 'api', updated_at = now();
      n := n + 1;
    END LOOP;
    v_next := j #>> '{paging,next}';
    IF v_next IS NOT NULL AND v_next ~ '^https://graph\.facebook\.com/' THEN
      INSERT INTO public.integracoes_fila (request_id) SELECT net.http_get(url := v_next, timeout_milliseconds := 30000);
    ELSE
      UPDATE public.integracoes SET ultimo_status = 'ok', ultimo_erro = NULL, ultima_sync = now() WHERE id = 'meta';
    END IF;
  END LOOP;
  DELETE FROM public.integracoes_fila WHERE processado AND criado_em < now() - interval '2 days';
  RETURN n;
END $$;
REVOKE ALL ON FUNCTION public.meta_sync_collect() FROM public, anon, authenticated;

-- botão "Sincronizar agora" (admin)
CREATE OR REPLACE FUNCTION public.meta_sync_agora()
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v bigint;
BEGIN
  IF NOT public.has_role(auth.uid(), 'admin') THEN RAISE EXCEPTION 'Apenas administradores'; END IF;
  v := public.meta_sync_start(90);
  IF v IS NULL THEN RETURN 'Configure a conta e o token da Meta primeiro.'; END IF;
  RETURN 'ok';
END $$;
REVOKE ALL ON FUNCTION public.meta_sync_agora() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.meta_sync_agora() TO authenticated;

-- ============ CARGA ÚNICA DO CRM ============
CREATE OR REPLACE FUNCTION public.crm_bootstrap()
RETURNS jsonb LANGUAGE plpgsql VOLATILE SECURITY INVOKER SET search_path = public AS $$
DECLARE
  uid uuid := auth.uid();
  v_role text;
  v_team boolean;
  v_admin boolean;
BEGIN
  IF uid IS NULL THEN RAISE EXCEPTION 'Não autenticado'; END IF;
  v_role := public.papel_de(uid);
  v_team := public.is_team_member(uid);
  v_admin := v_role = 'admin';
  IF v_team THEN PERFORM public.mover_para_lista_fria(); END IF;
  RETURN jsonb_build_object(
    'role', v_role,
    'active', v_team,
    'server_time', now(),
    'profile', (SELECT to_jsonb(p) FROM public.profiles p WHERE p.id = uid),
    'leads', CASE WHEN v_team THEN coalesce((SELECT jsonb_agg(to_jsonb(l) ORDER BY l.created_at DESC) FROM (SELECT * FROM public.leads ORDER BY created_at DESC LIMIT 3000) l), '[]'::jsonb) ELSE '[]'::jsonb END,
    'atividades', CASE WHEN v_team THEN coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.created_at DESC) FROM (SELECT * FROM public.atividades ORDER BY created_at DESC LIMIT 10000) a), '[]'::jsonb) ELSE '[]'::jsonb END,
    'profiles', coalesce((SELECT jsonb_agg(jsonb_build_object('id', p.id, 'nome', p.nome, 'avatar', p.avatar, 'ativo', p.ativo, 'email', p.email)) FROM public.profiles p), '[]'::jsonb),
    'closers', CASE WHEN v_team THEN coalesce((SELECT jsonb_agg(to_jsonb(c)) FROM public.listar_closers() c), '[]'::jsonb) ELSE '[]'::jsonb END,
    'team', CASE WHEN v_admin THEN coalesce((SELECT jsonb_agg(to_jsonb(t)) FROM public.listar_equipe() t), '[]'::jsonb) ELSE '[]'::jsonb END,
    'ganhos', CASE WHEN v_admin THEN coalesce((SELECT jsonb_agg(to_jsonb(g) ORDER BY g.data_fechamento DESC) FROM public.ganhos g), '[]'::jsonb) ELSE '[]'::jsonb END,
    'contratos', CASE WHEN v_admin THEN coalesce((SELECT jsonb_agg(to_jsonb(c) ORDER BY c.created_at DESC) FROM public.contratos c), '[]'::jsonb) ELSE '[]'::jsonb END,
    'ads', CASE WHEN v_admin THEN coalesce((SELECT jsonb_agg(to_jsonb(a) ORDER BY a.data DESC) FROM (SELECT * FROM public.ads_metricas WHERE data >= current_date - 400) a), '[]'::jsonb) ELSE '[]'::jsonb END,
    'integracao', CASE WHEN v_admin THEN (SELECT jsonb_build_object('conta_id', i.conta_id, 'ativo', i.ativo, 'tem_token', i.tem_token, 'api_version', i.api_version, 'ultima_sync', i.ultima_sync, 'ultimo_status', i.ultimo_status, 'ultimo_erro', i.ultimo_erro) FROM public.integracoes i WHERE i.id = 'meta') ELSE NULL END
  );
END $$;

-- permissões das funções chamadas pelo CRM
REVOKE ALL ON FUNCTION public.passar_para_closer(uuid, uuid, timestamptz, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.passar_para_closer(uuid, uuid, timestamptz, text) TO authenticated;
REVOKE ALL ON FUNCTION public.registrar_ganho(uuid, numeric, text, int, date, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.registrar_ganho(uuid, numeric, text, int, date, text) TO authenticated;
REVOKE ALL ON FUNCTION public.listar_closers() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.listar_closers() TO authenticated;

-- tempo real das novas tabelas (só admins recebem, pela RLS)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname='supabase_realtime' AND tablename='ganhos') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ganhos;
  END IF;
END $$;

COMMIT;

-- ============ AGENDAMENTOS ============
SELECT cron.unschedule(jobid) FROM cron.job WHERE jobname IN ('meta-sync', 'meta-collect');
SELECT cron.schedule('meta-sync', '7 * * * *', $$SELECT public.meta_sync_start(30);$$);
SELECT cron.schedule('meta-collect', '*/5 * * * *', $$SELECT public.meta_sync_collect();$$);
