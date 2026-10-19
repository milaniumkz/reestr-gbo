CREATE FUNCTION technical_event_integrity() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
 IF TG_OP = 'UPDATE' AND current_setting('ersi.legal_hold', true) = 'on'
 AND (to_jsonb(NEW) - 'holdUntil') = (to_jsonb(OLD) - 'holdUntil') THEN RETURN NEW; END IF;
 IF TG_OP = 'DELETE' AND current_setting('ersi.retention', true) = 'on'
 AND OLD."expiresAt" < now() AND (OLD."holdUntil" IS NULL OR OLD."holdUntil" < now()) THEN RETURN OLD; END IF;
 RAISE EXCEPTION 'Technical events are append-only';
END;
$$;
CREATE TRIGGER technical_event_integrity BEFORE UPDATE OR DELETE ON "TechnicalEvent"
FOR EACH ROW EXECUTE FUNCTION technical_event_integrity();
