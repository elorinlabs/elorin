const fs=require('fs'),path=require('path');
const root='test-fixtures/edit';
const fixtures={
 'text/basic.txt':'Hello Elorin\n你好 👋\n', 'text/utf8-bom.txt':'\ufeffBOM retained\n', 'text/crlf.txt':'one\r\ntwo\r\n', 'text/mixed-line-endings.txt':'one\r\ntwo\nthree\r', 'text/readonly.txt':'Read only\n',
 'markdown/basic.md':'# Hello\n\n**Elorin**\n', 'markdown/complex.md':'# Complex\n\n| Name | Value |\n|---|---|\n| A | 00123 |\n\n```ts\nconst n = 1;\n```\n\n<script>alert(1)</script>\n',
 'json/valid.json':'{"hello":"world"}\n','json/invalid.json':'{\n "a":\n}\n','json/formatting.json':'{ "a" : 1, "b": [ 2, 3 ] }','json/big-int.json':'{ "n": 90071992547409931234567890 }\n',
 'csv/basic.csv':'name,value\nAlice,00123\nBob,42\n','csv/semicolon.csv':'name;value\r\nAlice;00123\r\n','csv/tab.tsv':'name\tvalue\nAlice\t00123\n','csv/quoted.csv':'name,value\na,"he said ""hello"""\n','csv/multiline.csv':'name,value\na,"line one\nline two"\n','csv/ragged.csv':'a,b,c\n1,2\n3,4,5,6\n','csv/bom.csv':'\ufeffname,value\nAlice,00123\n',
 'code/basic.ts':'const greeting: string = "你好";\n','code/basic.py':'print("hello")\n','code/executable.sh':'#!/bin/sh\nprintf "hello\\n"\n'
};
for(const [name,text] of Object.entries(fixtures)) fs.writeFileSync(path.join(root,name),text);
for(const size of [1,10,20])fs.writeFileSync(path.join(root,`text/large-${size}mb.txt`),'abcdefghij\n'.repeat(Math.ceil(size*1024*1024/11)).slice(0,size*1024*1024));
fs.writeFileSync(path.join(root,'csv/100k.csv'),'name,value\n'+'row,00123\n'.repeat(99999));
console.log(`Generated ${Object.keys(fixtures).length + 4} edit fixtures`);
