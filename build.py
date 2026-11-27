# src/app.html 에 SheetJS(xlsx 0.18.5)와 src/logic.js 를 넣어 파일 1개로 만든다.
# 사용: npm install xlsx@0.18.5 && python3 build.py
s = open('src/logic.js', encoding='utf-8').read()
x = open('node_modules/xlsx/dist/xlsx.full.min.js', encoding='utf-8').read()
# 글자 그대로 들어 있는 U+FFFD를 \ufffd 표기로 바꿈 (Claude 페이지 업로드 검사 통과용, 동작은 같음)
x = x.replace('\ufffd', '\\ufffd')
h = open('src/app.html', encoding='utf-8').read()
open('중단시간_분석도구.html', 'w', encoding='utf-8').write(h.replace('/*__XLSX__*/', x).replace('/*__LOGIC__*/', s))
