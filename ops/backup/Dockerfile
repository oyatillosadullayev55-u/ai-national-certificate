FROM postgres:16-alpine
RUN apk add --no-cache gnupg
COPY backup.sh restore.sh /usr/local/bin/
RUN chmod +x /usr/local/bin/backup.sh /usr/local/bin/restore.sh
# Har 24 soatda backup; xato bo'lsa konteyner logida ko'rinadi
CMD ["sh", "-c", "while true; do backup.sh || echo 'BACKUP FAILED'; sleep ${BACKUP_INTERVAL_SEC:-86400}; done"]
