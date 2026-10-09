// Rebuild the deleted QA input from actual imports and translation calls.
const fs=require('fs'),path=require('path'),ts=require('typescript');
const entries=new Map();
function scan(dir){
  for(const item of fs.readdirSync(dir,{withFileTypes:true})){
    const file=path.join(dir,item.name);
    if(item.isDirectory()){scan(file);continue;}
    if(!/\.tsx?$/.test(file))continue;
    const source=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true),names=new Set();
    for(const node of source.statements){
      if(!ts.isImportDeclaration(node)||!node.moduleSpecifier.text.includes('i18n'))continue;
      const bindings=node.importClause?.namedBindings;
      if(bindings&&ts.isNamedImports(bindings))for(const member of bindings.elements)
        if((member.propertyName?.text??member.name.text)==='t')names.add(member.name.text);
    }
    function visit(node){
      if(ts.isCallExpression(node)&&ts.isIdentifier(node.expression)&&names.has(node.expression.text)&&node.arguments[0]&&ts.isStringLiteralLike(node.arguments[0])){
        const text=node.arguments[0].text,position=source.getLineAndCharacterOfPosition(node.getStart(source));
        if(!entries.has(text))entries.set(text,{text,locations:[]});
        entries.get(text).locations.push({file:file.replaceAll('\\','/'),line:position.line+1});
      }
      ts.forEachChild(node,visit);
    }
    visit(source);
  }
}
scan('src');
fs.mkdirSync('docs/qa/i18n',{recursive:true});
fs.writeFileSync('docs/qa/i18n/strings.json',JSON.stringify([...entries.values()],null,2));
console.log('Recovered runtime translation inventory:',entries.size);
