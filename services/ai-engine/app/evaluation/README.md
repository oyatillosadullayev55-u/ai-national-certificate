# AI sifatini baholash (PRD 10.5)

Bu papkaga ekspertlar tasdiqlagan "oltin to'plam" qo'yiladi: `golden/<fan>.jsonl`
(`{question, expected_points, must_not_contain}`).

`pytest tests/` mock provayder bilan xavfsizlik qoidalarini tekshiradi.
Haqiqiy model sifatini o'lchash uchun `LLM_PROVIDER=anthropic` bilan oltin to'plamni
ishga tushirib, ekspert baholari (95%+ maqsad) shu yerda yig'iladi.
