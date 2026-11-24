# Retrieval (RAG) — keyingi bosqich

`learning_materials.embedding` (pgvector, 1536) ustunidan foydalanadi.

Reja:
1. Ekspert tasdiqlagan material (`status = APPROVED`) saqlanganda embedding hisoblanadi (BullMQ worker).
2. Tutor so'rovida mavzu bo'yicha eng yaqin 3–5 bo'lak olinadi:
   `SELECT id, content FROM learning_materials WHERE "topicId" = $1 ORDER BY embedding <=> $2 LIMIT 5`
3. Bo'laklar `safety.guard.wrap_untrusted("material:<id>", text)` bilan o'ralib promptga qo'shiladi.
4. Javobda manba ID'lari qaytariladi — PRD 13: "AI izohlari manbalar bilan tekshiriladi".
