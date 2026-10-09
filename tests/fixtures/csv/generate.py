from pathlib import Path
import csv, sys

root = Path(__file__).parent
files = {
 'basic.csv':'id,name,city,active,revenue\n1,Alice,Tokyo,true,1284.42\n2,Bob,Osaka,false,892.10\n3,Carol,Kyoto,true,4218.00\n',
 'quoted.csv':'id,name,description\n1,Prism,"A viewer, explorer, and analyzer"\n2,CSV,"Supports ""quoted"" values"\n',
 'multiline.csv':'id,description\r\n1,"Hello\r\nWorld"\r\n2,"Another\r\nmultiline\r\nvalue"\r\n',
 'empty.csv':'', 'headerless.csv':'Alice,28,Tokyo\nBob,31,Osaka\n',
 'duplicate-headers.csv':'name,name,age\nAlice,A,28\nBob,B,31\n',
 'ragged.csv':'a,b,c\n1,2\n3,4,5,6\n7,8,9\n',
 'unicode.csv':'id,value\n1,中文\n2,日本語\n3,한국어\n4,🪩🌈\n5,مرحبا\n',
 'numbers.csv':'id,zip,large,decimal,mixed\n00123,00210,9223372036854775807,0.123456789012345678901,1\n00234,00211,9223372036854775806,1.25,2\n00345,00212,9223372036854775805,-2.5,N/A\n00456,00213,9223372036854775804,1e2,3\n00567,00214,9223372036854775803,2.5,4\n',
 'dates.csv':'date,time,ambiguous\n2026-10-08,2026-10-08T04:00:00Z,01/02/03\n2026-10-09,2026-10-09T04:00:00Z,02/03/04\n',
 'unsafe.csv':'id,value\n1,"<script>alert(1)</script>"\n2,"=SUM(A1:A10)"\n3,"javascript:alert(1)"\n4,"<img src=x onerror=alert(1)>"\n',
 'basic.tsv':'id\tname\tcity\n1\tAlice\tTokyo\n2\tBob\tOsaka\n',
 'semicolon.csv':'id;name;city\n1;Alice;Tokyo\n2;Bob;Osaka\n',
 'pipe.csv':'id|name|city\n1|Alice|Tokyo\n',
 'invalid.csv':'id,value\n1,ok\n2,"unclosed\n',
 'header-only.csv':'name,age,city\n', 'one-column.csv':'Alice\nBob\nCarol\n',
 'long-cell.csv':'id,value\n1,"'+('long ' * 5000)+'"\n',
}
root.mkdir(parents=True, exist_ok=True)
for name, text in files.items():
    (root/name).write_bytes(text.encode('utf-8'))
(root/'bom.csv').write_bytes(b'\xef\xbb\xbf'+files['basic.csv'].encode())
with (root/'wide.csv').open('w',encoding='utf-8',newline='') as f:
    writer=csv.writer(f);writer.writerow([f'column{i}' for i in range(10000)]);writer.writerow([f'value{i}' for i in range(10000)])

def large(name, count):
    with (root/name).open('w',encoding='utf-8',newline='') as f:
        writer=csv.writer(f);writer.writerow(['id','name','city','revenue']+[f'field{i}' for i in range(18)])
        for i in range(count):
            writer.writerow([i,f'Person {i}','Tokyo' if i%3==0 else 'Osaka',f'{i%10000}.25']+[f'{i}-{j}' for j in range(18)])
large('large.csv',100000)
if '--million' in sys.argv: large('million-local.csv',1000000)
print('CSV fixtures generated', '(including 1M local fixture)' if '--million' in sys.argv else '')
