"""Self-authored AP203 faceted cube assemblies; no proprietary model assets."""
from pathlib import Path
root=Path('test-fixtures/3d/cad');root.mkdir(parents=True,exist_ok=True)
def assembly(count):
 records=[]
 def add(value):records.append(value);return len(records)
 def ref(n):return '#'+str(n)
 app=add("APPLICATION_CONTEXT('configuration controlled 3d designs of mechanical parts and assemblies')")
 add(f"APPLICATION_PROTOCOL_DEFINITION('international standard','config_control_design',1994,#{app})")
 pc=add(f"PRODUCT_CONTEXT('',#{app},'mechanical')");pdc=add(f"PRODUCT_DEFINITION_CONTEXT('part definition',#{app},'design')")
 mm=add('(LENGTH_UNIT()NAMED_UNIT(*)SI_UNIT(.MILLI.,.METRE.))');rad=add('(NAMED_UNIT(*)PLANE_ANGLE_UNIT()SI_UNIT($,.RADIAN.))');sr=add('(NAMED_UNIT(*)SI_UNIT($,.STERADIAN.)SOLID_ANGLE_UNIT())')
 ctx=add(f"(GEOMETRIC_REPRESENTATION_CONTEXT(3)GLOBAL_UNIT_ASSIGNED_CONTEXT((#{mm},#{rad},#{sr}))REPRESENTATION_CONTEXT('',''))")
 origin=add("CARTESIAN_POINT('',(0.,0.,0.))");axis=add(f"AXIS2_PLACEMENT_3D('',#{origin},$,$)")
 def product(name):
  p=add(f"PRODUCT('{name}','{name}','',(#"+str(pc)+'))');formation=add(f"PRODUCT_DEFINITION_FORMATION_WITH_SPECIFIED_SOURCE('','',#{p},.NOT_KNOWN.)");pd=add(f"PRODUCT_DEFINITION('design','',#{formation},#{pdc})");pds=add(f"PRODUCT_DEFINITION_SHAPE('','',#{pd})");return pd,pds
 parent,parent_shape=product('Elorin Cube Assembly');rootshape=add(f"SHAPE_REPRESENTATION('Assembly',(#{axis}),#{ctx})");add(f'SHAPE_DEFINITION_REPRESENTATION(#{parent_shape},#{rootshape})')
 for i in range(count):
  pd,pds=product(f'Part {i+1}');points=[add("CARTESIAN_POINT('',(%s.,%s.,%s.))"%(x,y,z))for x,y,z in [(0,0,0),(10,0,0),(10,10,0),(0,10,0),(0,0,10),(10,0,10),(10,10,10),(0,10,10)]]
  faces=[]
  for indices in [(0,3,2,1),(4,5,6,7),(0,1,5,4),(1,2,6,5),(2,3,7,6),(3,0,4,7)]:
   loop=add("POLY_LOOP('',("+','.join(ref(points[n])for n in indices)+'))');bound=add(f"FACE_OUTER_BOUND('',#{loop},.T.)");coords=[(0,0,0),(10,0,0),(10,10,0),(0,10,0),(0,0,10),(10,0,10),(10,10,10),(0,10,10)];a,b,c=[coords[n]for n in indices[:3]];u=[b[j]-a[j]for j in range(3)];v=[c[j]-a[j]for j in range(3)];normal=(u[1]*v[2]-u[2]*v[1],u[2]*v[0]-u[0]*v[2],u[0]*v[1]-u[1]*v[0]);direction=add("DIRECTION('',(%s.,%s.,%s.))"%normal);placement=add(f"AXIS2_PLACEMENT_3D('',#{points[indices[0]]},#{direction},$)");plane=add(f"PLANE('',#{placement})");faces.append(add(f"FACE_SURFACE('',(#{bound}),#{plane},.T.)"))
  shell=add("CLOSED_SHELL('',("+','.join(map(ref,faces))+'))');brep=add(f"FACETED_BREP('Cube {i+1}',#{shell})");shape=add(f"FACETED_BREP_SHAPE_REPRESENTATION('Part {i+1}',(#{brep}),#{ctx})");add(f'SHAPE_DEFINITION_REPRESENTATION(#{pds},#{shape})')
  translation=add("CARTESIAN_POINT('',(%s.,%s.,0.))"%((i%32)*15,(i//32)*15));placed=add(f"AXIS2_PLACEMENT_3D('',#{translation},$,$)");transform=add(f"ITEM_DEFINED_TRANSFORMATION('','',#{axis},#{placed})")
  usage=add(f"NEXT_ASSEMBLY_USAGE_OCCURRENCE('{i+1}','','',#{parent},#{pd},$)");relshape=add(f"PRODUCT_DEFINITION_SHAPE('','',#{usage})");relation=add(f"(REPRESENTATION_RELATIONSHIP('','',#{shape},#{rootshape})REPRESENTATION_RELATIONSHIP_WITH_TRANSFORMATION(#{transform})SHAPE_REPRESENTATION_RELATIONSHIP())");add(f'CONTEXT_DEPENDENT_SHAPE_REPRESENTATION(#{relation},#{relshape})')
 return "ISO-10303-21;\nHEADER;\nFILE_DESCRIPTION(('Elorin self-authored test'),'2;1');\nFILE_NAME('test.step','2026-10-08T00:00:00',('Elorin'),('Elorin'),'','','');\nFILE_SCHEMA(('CONFIG_CONTROL_DESIGN'));\nENDSEC;\nDATA;\n"+'\n'.join(f'#{n+1}={value};'for n,value in enumerate(records))+"\nENDSEC;\nEND-ISO-10303-21;\n"
for name,count in [('assembly.step',3),('many-parts.step',1000),('large.step',1000)]:
 (root/name).write_text(assembly(count),encoding='utf-8')
(root/'malformed.step').write_text('ISO-10303-21;\nDATA;\n#1=INVALID();')
print('Self-authored CAD assemblies generated')
