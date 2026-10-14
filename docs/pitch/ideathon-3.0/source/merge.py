import zipfile,xml.etree.ElementTree as E,copy,posixpath
src='template/CINTEL_Ideathon_3.0_Pitch_Deck_Template FINAL.pptx'
a=zipfile.ZipFile(src); b=zipfile.ZipFile('source/overlay.pptx'); files={n:a.read(n) for n in a.namelist()}
ns={'p':'http://schemas.openxmlformats.org/presentationml/2006/main','a':'http://schemas.openxmlformats.org/drawingml/2006/main','r':'http://schemas.openxmlformats.org/officeDocument/2006/relationships'}
for k,v in ns.items():E.register_namespace(k,v)
P=lambda x:'{'+ns['p']+'}'+x
A=lambda x:'{'+ns['a']+'}'+x
R='{http://schemas.openxmlformats.org/package/2006/relationships}'
xml=lambda x:E.tostring(x,encoding='utf-8',xml_declaration=True)
for i in range(1,8):
 name=f'ppt/slides/slide{i}.xml'; root=E.fromstring(files[name]); tree=root.find('.//p:spTree',ns)
 ov=E.fromstring(b.read(name)); ot=ov.find('.//p:spTree',ns)
 relname=f'ppt/slides/_rels/slide{i}.xml.rels'; rels=E.fromstring(files[relname]); orls=E.fromstring(b.read(relname)); rmap={}
 for j,r in enumerate(orls):
  if r.get('Type').endswith('/image'):
   target=r.get('Target').lstrip('/'); dest='ppt/media/socius_'+posixpath.basename(target); files[dest]=b.read(target)
   nr=copy.deepcopy(r);nr.set('Id',f'rIdSocius{j}');nr.set('Target','../media/'+posixpath.basename(dest));rmap[r.get('Id')]=nr.get('Id');rels.append(nr)
 ids=[int(x.get('id')) for x in root.findall('.//p:cNvPr',ns)];shift=max(ids)+100
 for child in ot:
  if child.tag in [P('nvGrpSpPr'),P('grpSpPr')]:continue
  x=copy.deepcopy(child)
  for q in x.iter():
   if q.tag==P('cNvPr'):q.set('id',str(int(q.get('id'))+shift))
   if q.tag in [A('stCxn'),A('endCxn')]:q.set('id',str(int(q.get('id'))+shift))
   for attr,val in list(q.attrib.items()):
    if attr.startswith('{'+ns['r']+'}') and val in rmap:q.set(attr,rmap[val])
  tree.append(x)
 if i==1:
  bodies=[x for x in tree.findall('p:sp',ns) if x.find('.//p:ph[@type="body"]',ns) is not None]
  for shape,txt in zip(bodies,['Socius','California Burrito','AI Automation']):
   old=shape.find('p:txBody',ns)
   if old is not None:shape.remove(old)
   tx=E.SubElement(shape,P('txBody'));E.SubElement(tx,A('bodyPr'),{'anchor':'ctr','lIns':'0','rIns':'0'});E.SubElement(tx,A('lstStyle'));par=E.SubElement(tx,A('p'));run=E.SubElement(par,A('r'));rp=E.SubElement(run,A('rPr'),{'sz':'1600','lang':'en-US'});fill=E.SubElement(rp,A('solidFill'));E.SubElement(fill,A('srgbClr'),{'val':'FFFFFF'});E.SubElement(rp,A('latin'),{'typeface':'Calibri'});E.SubElement(run,A('t')).text=txt
 files[name]=xml(root);files[relname]=xml(rels)
 # Copy note body only, retaining template note geometry and relationships.
 nn=f'ppt/notesSlides/notesSlide{i}.xml';nr=E.fromstring(files[nn]);on=E.fromstring(b.read(nn));newbody=on.find('.//p:sp[p:nvSpPr/p:nvPr/p:ph[@type="body"]]',ns) if False else None
 for sp in nr.findall('.//p:sp',ns):
  if sp.find('.//p:ph[@type="body"]',ns) is not None:
   old=sp.find('p:txBody',ns)
   for osp in on.findall('.//p:sp',ns):
    if osp.find('.//p:ph[@type="body"]',ns) is not None:
     if old is not None:sp.remove(old)
     sp.append(copy.deepcopy(osp.find('p:txBody',ns)))
 files[nn]=xml(nr)
ct=E.fromstring(files['[Content_Types].xml']);ctns='{http://schemas.openxmlformats.org/package/2006/content-types}'
if not any(x.get('Extension')=='png' for x in ct):E.SubElement(ct,ctns+'Default',{'Extension':'png','ContentType':'image/png'})
files['[Content_Types].xml']=a.read('[Content_Types].xml')
with zipfile.ZipFile('source/candidate.pptx','w',zipfile.ZIP_DEFLATED) as z:
 for n,data in files.items():z.writestr(n,data)
print('Merged content; source masters, layouts, background assets and theme kept byte-for-byte')
