# Gercek kullanim olcumu, 14-28 Ekim 2026

Iki soru var. Rewrite'lar kabul ediliyor mu (oldugu gibi, duzenlenip, geri alinip)? Siradan bir prompt'ta eksik olan ne? Hedef en az 30 rewrite.

## Kurulum

Eklenti bu klasorden yuklenir, her oturumda:

```sh
claude --plugin-dir /mnt/c/Messiah/Projects/sharpprompt
```

Her oturuma elle eklemek istemezsen klasoru `~/.claude/settings.json` icindeki `env` blogunda `CLAUDE_CODE_PLUGIN_DIRS`'e yaz. `/config` icinde mode `fill`, Ask before sending acik, Session facts acik, Usage log acik kalir. Hepsi zaten varsayilan, baska ayar degismez. Calistigini `/sharp stats` gosterir, son satiri `Log: n records`.

## Kullanim

- Prompt'larini her zamanki gibi yaz. sharpprompt icin ozel bir caba gosterme, yoksa olcum bozulur.
- Bant gelince ne istiyorsan onu yap: Enter, kutuda duzenle ya da `r`. Hicbiri "dogru" cevap degil.
- Soru penceresi gelirse bildigini sec. Bilmiyorsan pencereyi kapat.
- Bir prompt'un rewrite'a gitmesini istemiyorsan basina `raw:` yaz. Bu da kayda gecmez, sayaca gecer.

## Kayit

Kayit eklentinin kendi store dosyasinda durur ve makineden cikmaz: `~/.claude/plugins/store/sharpprompt_<kaynak>-<hash>.json`. Son 300 rewrite tutulur.

## Takvim

- 14 Eki: Fable ara kontrol yapar, yalniz n'e bakar (`/sharp stats` ya da export).
- 28 Eki: tek export ve analiz.

```sh
node scripts/export_log.mjs
node scripts/usage_report.mjs docs/measurements/usage/2026-10-28.jsonl
```

Export dosyasinda yazdigin prompt'larin metni var. Commit edilip edilmeyecegine sen karar verirsin; varsayilan olarak commit edilmez.
