# ナレッジの置き場所

GPTsのナレッジファイル(PDF/Word等)は **Markdown に変換**して配置します。

- `common/` … 全ガイド共通
- `know/` `run/` `decide/` `hardware/` `security/` … ガイド専用

規則: `*.md` のみ読み込み。ファイル名の昇順。先頭が `_` のファイルは無視(下書き用)。
合計が約40万文字を超えると、ビルド時に Knowledge Bases(第2段階)移行の警告が出ます。
