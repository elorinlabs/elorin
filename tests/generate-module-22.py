"""Standard NumPy fixtures; uses existing fixture-tool environment, never application runtime."""
import sys,pathlib,zipfile
root=pathlib.Path(__file__).resolve().parents[1];sys.path.insert(0,str(root/'.tools/module14-fixtures'))
import numpy as np
out=root/'test-fixtures/advanced22';out.mkdir(exist_ok=True)
np.save(out/'matrix.npy',np.arange(24,dtype=np.float32).reshape(2,3,4))
np.save(out/'fortran.npy',np.asfortranarray(np.arange(12,dtype='>i4').reshape(3,4)))
np.save(out/'int64.npy',np.array([9223372036854775807,-9223372036854775808],dtype=np.int64))
np.save(out/'scalar.npy',np.array(3.25,dtype=np.float64))
np.save(out/'empty.npy',np.zeros((0,3),dtype=np.float32))
np.save(out/'complex.npy',np.array([3+4j,5-6j],dtype=np.complex128))
np.save(out/'object.npy',np.array([{'not_executed':'pickle is blocked'}],dtype=object))
np.save(out/'half.npy',np.array([0,-0.,1.5,np.nan,np.inf],dtype=np.float16))
np.savez_compressed(out/'arrays.npz',matrix=np.arange(12,dtype=np.int16).reshape(3,4),precise=np.array([9223372036854775807],dtype=np.int64))
(out/'example.srt').write_text('\ufeff1\n00:00:01,000 --> 00:00:03,000\n科研 🌈\nSecond line\n\n2\n00:00:02,000 --> 00:00:04,000\nOverlap\n',encoding='utf8')
(out/'example.vtt').write_text('WEBVTT\n\nNOTE ignored comment\n\nintro\n00:01.000 --> 00:02.500\nHello 🌈\n',encoding='utf8')
(out/'example.ass').write_text('[V4+ Styles]\nFormat: Name, Fontname\nStyle: Default,Arial\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:01.00,0:00:03.50,Default,,0,0,0,,{\\b1}Hello, world\\N科研\n',encoding='utf8')
(out/'example.sub').write_text('{1}{1}25\n{25}{50}Hello|World\n',encoding='utf8')
print([(p.name,p.stat().st_size) for p in out.iterdir()])
