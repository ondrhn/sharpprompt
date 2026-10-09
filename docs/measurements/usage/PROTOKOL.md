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

## Token ek yuku

Soru: eklenti acikken bir gunluk calismada harcanan token'in yuzde kaci eklentinin kendi cagrilarina gidiyor (classify, rewrite, yarisi kaybedip arkada biten fork'lar)?

- Eklenti kurulduktan sonraki ilk 24 saat. Onder normal calisir, ozel bir sey yapmaz.
- 24 saat dolunca:

```sh
node scripts/token_overhead.mjs --out docs/measurements/token-overhead-<tarih>.md
```

- Varsayilan pencere son 24 saat. Baska pencere icin `--from 2026-10-14T09:00:00Z --to 2026-10-15T09:00:00Z`.
- Oturum tarafi yalniz interaktif oturumlar (transcript'te `entrypoint: cli`). `claude -p` kosulari, bench dahil, sayilmaz. Bir proje klasoru disarida kalsin istenirse `--exclude-project <ad parcasi>`.
- Classify token'i tahmindir: motor classify icin usage dondurmuyor. Haiku oldugu icin dolar satirinda payi kucuk.
- Cikti API fiyatiyla dolar karsiligi verir. Max kotasi token sayisina birebir bagli degil; bu yuzde "API olsaydi" karsiligidir.
