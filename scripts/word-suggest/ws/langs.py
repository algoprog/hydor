"""Language codes: the two-letter (or WildChat's own) codes of the text files -> FLORES-200 codes, the ones the language switch lists
(the app's language guess gives FLORES codes). ws/mix.py Gate.choice reads a language that is not in the switch through this table,
so that a test file with 'en' (data/user_msgs.jsonl) is switched as eng_Latn is."""

# two-letter codes (WildChat's names too, typed.py LANG) -> FLORES-200
ISO_TO_FLORES = {"en": "eng_Latn", "zh": "zho_Hans", "ru": "rus_Cyrl", "fr": "fra_Latn", "es": "spa_Latn", "de": "deu_Latn", "pt": "por_Latn",
          "it": "ita_Latn", "ja": "jpn_Jpan", "ko": "kor_Hang", "ar": "arb_Arab", "tr": "tur_Latn", "pl": "pol_Latn", "vi": "vie_Latn",
          "id": "ind_Latn", "nl": "nld_Latn", "uk": "ukr_Cyrl", "cs": "ces_Latn", "th": "tha_Thai", "he": "heb_Hebr", "fa": "pes_Arab",
          "hi": "hin_Deva", "sv": "swe_Latn", "ro": "ron_Latn", "hu": "hun_Latn", "el": "ell_Grek", "fi": "fin_Latn", "da": "dan_Latn",
          "bg": "bul_Cyrl", "no": "nob_Latn", "bokmal": "nob_Latn", "nynorsk": "nno_Latn", "sk": "slk_Latn", "ca": "cat_Latn",
          "hr": "hrv_Latn", "sr": "srp_Cyrl", "lt": "lit_Latn", "lv": "lvs_Latn", "sl": "slv_Latn", "slovene": "slv_Latn",
          "et": "est_Latn", "ms": "zsm_Latn", "bn": "ben_Beng", "tl": "tgl_Latn", "ur": "urd_Arab", "ta": "tam_Taml", "sw": "swh_Latn",
          "af": "afr_Latn", "cy": "cym_Latn", "eu": "eus_Latn", "gl": "glg_Latn", "sq": "als_Latn", "hy": "hye_Armn", "az": "azj_Latn",
          "be": "bel_Cyrl", "ka": "kat_Geor", "kk": "kaz_Cyrl", "mk": "mkd_Cyrl", "mn": "khk_Cyrl", "ne": "npi_Deva", "uz": "uzn_Latn",
          "is": "isl_Latn", "ga": "gle_Latn", "mt": "mlt_Latn", "eo": "epo_Latn", "bs": "bos_Latn", "kn": "kan_Knda", "mr": "mar_Deva",
          "te": "tel_Telu", "gu": "guj_Gujr", "pa": "pan_Guru", "ml": "mal_Mlym", "my": "mya_Mymr", "km": "khm_Khmr", "lo": "lao_Laoo",
          "si": "sin_Sinh", "am": "amh_Ethi", "so": "som_Latn", "yo": "yor_Latn", "zu": "zul_Latn", "tswana": "tsn_Latn",
          "tsonga": "tso_Latn", "sotho": "sot_Latn", "xhosa": "xho_Latn", "shona": "sna_Latn", "maori": "mri_Latn"}

