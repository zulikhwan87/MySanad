-- =============================================================================
-- MySanad Migration 014: More qiraat & riwayat, simpler sanad entry
--
--  * Qiraat Abu Ja'far (Ibn Wardan, Ibn Jammaz), Ya'qub al-Hadrami (Ruwais, Rauh) and
--    Khalaf al-'Asyir (Ishaq, Idris); riwayat for Ibn 'Amir (Hisyam, Ibn Zakwan),
--    Hamzah (Khalaf, Khallad) and al-Kisa'i (Abu al-Harith, Duri al-Kisa'i).
--  * "Qiraat Tujuh" before "Qiraat Sepuluh Mutawatirah", with riwayat "Jam'ul Qiraat al-Sab'"
--    listed before "Jam'ul Qiraat al-'Asyar", followed by the 'Asyarah Sughra and Kubra.
--  * sanad_nodes.generation_category becomes optional: teachers enter names only.
--  * Method of receiving (kaedah pengambilan; all by talaqqi musyafahah): by memory (ghaiban, default),
--    reading from the mushaf, or online.
--    Existing values are kept as they are; teachers may change them in the editor.
-- Idempotent.
-- =============================================================================

INSERT INTO public.qiraat_types (code, imam_name_rumi, imam_name_arabic, title_rumi, title_arabic, era_hijri, region_origin, display_order) VALUES
('Q08-ABUJAFAR', 'Imam Abu Ja''far al-Madani', 'الإمام أبو جعفر المدني', 'Qiraat Abu Ja''far al-Madani', 'قراءة أبي جعفر المدني', 'Wafat 130H', 'Madinah al-Munawwarah', 8),
('Q09-YAQUB', 'Imam Ya''qub al-Hadrami', 'الإمام يعقوب الحضرمي', 'Qiraat Ya''qub al-Hadrami', 'قراءة يعقوب الحضرمي', '117H - 205H', 'Basrah', 9),
('Q10-KHALAF', 'Imam Khalaf al-''Asyir', 'الإمام خلف العاشر', 'Qiraat Khalaf al-''Asyir', 'قراءة خلف العاشر', '150H - 229H', 'Baghdad', 10),
('Q-SABAH', 'Qiraat Tujuh', 'القراءات السبع', 'Qiraat Tujuh (al-Qiraat al-Sab'')', 'القراءات السبع', 'Mutawatirah', 'Haramain, Iraq & Syam', 11)
ON CONFLICT (code) DO NOTHING;

UPDATE public.qiraat_types SET display_order = 12 WHERE code = 'Q10-ASHARAH';

-- Riwayat 1-8 already exist (Hafs, Syu'bah, Qalun, Warsy, al-Bazzi, Qunbul, al-Duri, al-Susi).
WITH q AS (SELECT id, code FROM public.qiraat_types)
INSERT INTO public.riwayat_types (qiraat_id, code, rawi_name_rumi, rawi_name_arabic, full_label_rumi, full_label_arabic, era_hijri, display_order)
SELECT q.id, r.code, r.rawi_rumi, r.rawi_ar, r.label_rumi, r.label_ar, r.era, r.ord
FROM q
JOIN (VALUES
    ('Q04-IBNAMIR', 'R-HISYAM', 'Imam Hisyam', 'هشام', 'Riwayat Hisyam ''an Ibn ''Amir', 'رواية هشام عن ابن عامر', '153H - 245H', 9),
    ('Q04-IBNAMIR', 'R-IBNZAKWAN', 'Imam Ibn Zakwan', 'ابن ذكوان', 'Riwayat Ibn Zakwan ''an Ibn ''Amir', 'رواية ابن ذكوان عن ابن عامر', '173H - 242H', 10),
    ('Q06-HAMZAH', 'R-KHALAF-HAMZAH', 'Imam Khalaf', 'خلف', 'Riwayat Khalaf ''an Hamzah', 'رواية خلف عن حمزة', '150H - 229H', 11),
    ('Q06-HAMZAH', 'R-KHALLAD', 'Imam Khallad', 'خلاد', 'Riwayat Khallad ''an Hamzah', 'رواية خلاد عن حمزة', 'Wafat 220H', 12),
    ('Q07-KISAI', 'R-ABULHARITH', 'Imam Abu al-Harith', 'أبو الحارث', 'Riwayat Abu al-Harith ''an al-Kisa''i', 'رواية أبي الحارث عن الكسائي', 'Wafat 240H', 13),
    ('Q07-KISAI', 'R-DURI-KISAI', 'Imam al-Duri', 'الدوري', 'Riwayat Duri al-Kisa''i', 'رواية الدوري عن الكسائي', '150H - 246H', 14),
    ('Q08-ABUJAFAR', 'R-IBNWARDAN', 'Imam Ibn Wardan', 'ابن وردان', 'Riwayat Ibn Wardan ''an Abi Ja''far', 'رواية ابن وردان عن أبي جعفر', 'Wafat 160H', 15),
    ('Q08-ABUJAFAR', 'R-IBNJAMMAZ', 'Imam Ibn Jammaz', 'ابن جماز', 'Riwayat Ibn Jammaz ''an Abi Ja''far', 'رواية ابن جماز عن أبي جعفر', 'Wafat 170H', 16),
    ('Q09-YAQUB', 'R-RUWAIS', 'Imam Ruwais', 'رويس', 'Riwayat Ruwais ''an Ya''qub', 'رواية رويس عن يعقوب', 'Wafat 238H', 17),
    ('Q09-YAQUB', 'R-RAUH', 'Imam Rauh', 'روح', 'Riwayat Rauh ''an Ya''qub', 'رواية روح عن يعقوب', 'Wafat 234H', 18),
    ('Q10-KHALAF', 'R-ISHAQ-KHALAF', 'Imam Ishaq', 'إسحاق', 'Riwayat Ishaq ''an Khalaf al-''Asyir', 'رواية إسحاق عن خلف العاشر', 'Wafat 286H', 19),
    ('Q10-KHALAF', 'R-IDRIS-KHALAF', 'Imam Idris', 'إدريس', 'Riwayat Idris ''an Khalaf al-''Asyir', 'رواية إدريس عن خلف العاشر', 'Wafat 292H', 20),
    ('Q-SABAH', 'R-JAM-SABAH', 'Jam''ul Qiraat al-Sab''', 'جمع القراءات السبع', 'Jam''ul Qiraat al-Sab''', 'جمع القراءات السبع', 'Mutawatirah', 21),
    ('Q10-ASHARAH', 'R-JAM-ASHARAH-SUGHRA', 'Jam''ul Qiraat al-''Asyarah al-Sughra', 'جمع القراءات العشر الصغرى', 'Jam''ul Qiraat al-''Asyarah al-Sughra', 'جمع القراءات العشر الصغرى', 'Mutawatirah', 23),
    ('Q10-ASHARAH', 'R-JAM-ASHARAH-KUBRA', 'Jam''ul Qiraat al-''Asyarah al-Kubra', 'جمع القراءات العشر الكبرى', 'Jam''ul Qiraat al-''Asyarah al-Kubra', 'جمع القراءات العشر الكبرى', 'Mutawatirah', 24)
) AS r(q_code, code, rawi_rumi, rawi_ar, label_rumi, label_ar, era, ord) ON q.code = r.q_code
ON CONFLICT (code) DO NOTHING;

UPDATE public.riwayat_types SET display_order = 22 WHERE code = 'R-JAM-ASHARAH';

-- Names only: the generation category is optional (NULL passes the existing CHECK).
ALTER TABLE public.sanad_nodes ALTER COLUMN generation_category DROP NOT NULL;

ALTER TABLE public.sanad_chains ALTER COLUMN transmission_method SET DEFAULT 'Bacaan secara hafazan (ghaiban)';
ALTER TABLE public.sanad_edges ALTER COLUMN transmission_relationship SET DEFAULT 'Bacaan secara hafazan (ghaiban)';
