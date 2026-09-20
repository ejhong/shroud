"""Minimal read-only SDNA reader for the open Blender 2.91 reference asset."""
import struct, re
from pathlib import Path

class Blend:
    def __init__(self, path):
        self.raw=Path(path).read_bytes(); assert self.raw[:12]==b'BLENDER-v291'
        self.blocks=[]; self.pointers={}; p=12
        while p<len(self.raw):
            code,size,ptr,sdna,count=struct.unpack_from('<4sIQII',self.raw,p);p+=24
            block=dict(code=code,size=size,ptr=ptr,sdna=sdna,count=count,data=self.raw[p:p+size]);p+=size
            self.blocks.append(block);self.pointers[ptr]=block
            if code==b'DNA1': dna=block['data']
            if code==b'ENDB':break
        assert dna[:8]==b'SDNANAME';p=8
        def num(fmt):
            nonlocal p
            value=struct.unpack_from('<'+fmt,dna,p);p+=struct.calcsize('<'+fmt);return value[0] if len(value)==1 else value
        def strings():
            nonlocal p
            n=num('I');out=[]
            for i in range(n):
                end=dna.index(0,p);out.append(dna[p:end].decode());p=end+1
            p=(p+3)&~3;return out
        self.names=strings();assert dna[p:p+4]==b'TYPE';p+=4;self.types=strings()
        assert dna[p:p+4]==b'TLEN';p+=4
        self.sizes=[num('H') for t in self.types];p=(p+3)&~3
        assert dna[p:p+4]==b'STRC';p+=4
        self.structs=[];self.bytype={}
        for i in range(num('I')):
            tid,n=num('HH');fields={};off=0
            for j in range(n):
                typ,name=num('HH');name=self.names[name];length=1
                for dim in re.findall(r'\[(\d+)\]',name):length*=int(dim)
                ptr='*' in name;size=(8 if ptr else self.sizes[typ])*length
                fields[name]=dict(type=self.types[typ],offset=off,size=size,pointer=ptr,length=length);off+=size
            assert off==self.sizes[tid],(self.types[tid],off,self.sizes[tid])
            item=dict(type=self.types[tid],size=off,fields=fields);self.structs.append(item);self.bytype[item['type']]=item
    def get(self,data,typ,field):
        f=next(v for k,v in self.bytype[typ]['fields'].items() if re.sub(r'\[.*|\*','',k)==field)
        b=data[f['offset']:f['offset']+f['size']]
        if f['pointer']:return struct.unpack_from('<Q',b)[0]
        if f['type']=='char':return b.rstrip(b'\0').decode(errors='replace')
        fmt={'float':'f','int':'i','short':'h','double':'d'}.get(f['type'])
        if not fmt:return b
        values=struct.unpack('<'+fmt*f['length'],b);return values[0] if len(values)==1 else values
    def readptr(self,ptr):return self.pointers[ptr]['data']
