-- MY7 CRM — blindagem de segurança (26/11/2026)
-- Aplicado no banco do site/quiz (Lovable Cloud, projeto My7companytest).
BEGIN;

-- 1) "Admin pelo login": o gatilho que dava admin para quem se cadastrasse com o e-mail do dono
--    não é mais necessário (o admin já existe). Removido para ninguém conseguir explorar.
DROP TRIGGER IF EXISTS on_auth_user_created_grant_admin ON auth.users;
DROP FUNCTION IF EXISTS public.grant_admin_on_signup();

-- 2) Visitante anônimo (só com a chave pública) não toca em nenhuma tabela.
--    O quiz continua funcionando porque salva pela função save_lead_progress.
REVOKE ALL ON ALL TABLES IN SCHEMA public FROM anon;
REVOKE ALL ON ALL SEQUENCES IN SCHEMA public FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE ALL ON SEQUENCES FROM anon;

-- 3) Funções internas: anônimo não executa nada além do quiz.
DO $$
DECLARE f record;
BEGIN
  FOR f IN SELECT p.oid::regprocedure AS sig, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public' LOOP
    EXECUTE format('REVOKE ALL ON FUNCTION %s FROM PUBLIC, anon', f.sig);
    IF f.proname <> 'save_lead_progress' THEN
      EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', f.sig);
    END IF;
  END LOOP;
END $$;
ALTER DEFAULT PRIVILEGES IN SCHEMA public REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC, anon;
-- funções que só o servidor (cron/gatilho) usa continuam fechadas também para usuários logados
REVOKE ALL ON FUNCTION public.meta_sync_start(int) FROM authenticated;
REVOKE ALL ON FUNCTION public.meta_sync_collect() FROM authenticated;
REVOKE ALL ON FUNCTION public.enviar_contrato_carteira() FROM authenticated;

-- 4) "Pedido falso" / spam no quiz: validação no servidor (não só na tela) + limite de envios.
CREATE OR REPLACE FUNCTION public.save_lead_progress(
  p_id uuid, p_nome text, p_whatsapp text, p_cargo text, p_segmento text, p_faturamento text, p_instagram text,
  p_origem text, p_utm_source text, p_utm_medium text, p_utm_campaign text, p_utm_content text, p_utm_term text,
  p_ultima_etapa integer, p_completo boolean)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  clean CONSTANT text := '[<>{}`\\]';
  v_nome text := left(trim(regexp_replace(coalesce(p_nome, ''), clean, '', 'g')), 120);
  v_wa text := regexp_replace(coalesce(p_whatsapp, ''), '\D', '', 'g');
  v_cargo text := nullif(left(trim(regexp_replace(coalesce(p_cargo, ''), clean, '', 'g')), 120), '');
  v_seg text := nullif(left(trim(regexp_replace(coalesce(p_segmento, ''), clean, '', 'g')), 120), '');
  v_fat text := nullif(left(trim(regexp_replace(coalesce(p_faturamento, ''), clean, '', 'g')), 120), '');
  v_ig text := nullif(left(regexp_replace(trim(coalesce(p_instagram, '')), '^@', ''), 60), '');
  v_origem text := CASE WHEN p_origem IN ('hero','header','cta_final') THEN p_origem ELSE 'hero' END;
  v_score int; v_classe text;
  u text[] := ARRAY[p_utm_source, p_utm_medium, p_utm_campaign, p_utm_content, p_utm_term];
BEGIN
  IF p_id IS NULL THEN RAISE EXCEPTION 'id obrigatório'; END IF;
  IF char_length(v_nome) < 2 THEN RAISE EXCEPTION 'Nome inválido'; END IF;
  IF v_wa !~ '^55[0-9]{10,11}$' THEN RAISE EXCEPTION 'WhatsApp inválido'; END IF;
  IF v_ig IS NOT NULL AND v_ig !~ '^[A-Za-z0-9._]{1,60}$' THEN RAISE EXCEPTION 'Instagram inválido'; END IF;
  FOR i IN 1..5 LOOP u[i] := nullif(left(regexp_replace(coalesce(u[i], ''), clean, '', 'g'), 120), ''); END LOOP;

  v_score := public.calc_lead_score(v_nome, v_wa, v_cargo, v_seg, v_fat, v_ig);
  v_classe := public.calc_lead_classe(v_score);

  IF EXISTS (SELECT 1 FROM public.leads WHERE id = p_id) THEN
    UPDATE public.leads SET nome = v_nome, whatsapp = v_wa, cargo = v_cargo, segmento = v_seg,
      faturamento = v_fat, instagram = v_ig, score = v_score, classe = v_classe,
      ultima_etapa = greatest(1, least(6, coalesce(p_ultima_etapa, 1))), completo = coalesce(p_completo, false)
    WHERE id = p_id AND completo = false AND created_at > now() - interval '6 hours';
  ELSE
    -- mesmo WhatsApp: no máximo 3 cadastros em 24h; site inteiro: no máximo 120 novos leads por hora
    IF (SELECT count(*) FROM public.leads WHERE whatsapp = v_wa AND created_at > now() - interval '24 hours') >= 3 THEN
      RAISE EXCEPTION 'Muitos envios. Tente mais tarde.';
    END IF;
    IF (SELECT count(*) FROM public.leads WHERE created_at > now() - interval '1 hour') >= 120 THEN
      RAISE EXCEPTION 'Muitos envios. Tente mais tarde.';
    END IF;
    INSERT INTO public.leads (id, nome, whatsapp, cargo, segmento, faturamento, instagram, score, classe,
      origem, utm_source, utm_medium, utm_campaign, utm_content, utm_term, ultima_etapa, completo)
    VALUES (p_id, v_nome, v_wa, v_cargo, v_seg, v_fat, v_ig, v_score, v_classe,
      v_origem, u[1], u[2], u[3], u[4], u[5],
      greatest(1, least(6, coalesce(p_ultima_etapa, 1))), coalesce(p_completo, false));
  END IF;
END $function$;
REVOKE ALL ON FUNCTION public.save_lead_progress(uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.save_lead_progress(uuid,text,text,text,text,text,text,text,text,text,text,text,text,integer,boolean) TO anon, authenticated;
CREATE INDEX IF NOT EXISTS leads_whatsapp_created_idx ON public.leads (whatsapp, created_at DESC);
CREATE INDEX IF NOT EXISTS leads_created_idx ON public.leads (created_at DESC);

-- 5) função sem search_path fixo
ALTER FUNCTION public.touch_updated_at() SET search_path = public;

COMMIT;
