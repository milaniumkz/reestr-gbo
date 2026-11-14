import { createCipheriv, createDecipheriv, createHmac, randomBytes, randomUUID } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
/** All biometric material is encrypted before disk/DB; the key stays on private storage. */
export class IdentityVault {
    readonly root = join(process.env.IDENTITY_STORAGE_DIR || '/opt/reestr/storage/private', 'identity');
    private key?: Buffer;
    async init() {
        await fs.mkdir(this.root, {recursive:true,mode:0o700});
        const path=join(this.root,'key.bin');
        const entries = await fs.readdir(this.root);
        if (!entries.includes('key.bin') && entries.length) throw new Error('Restore the original identity encryption key from backup');
        try { await fs.writeFile(path,randomBytes(32),{flag:'wx',mode:0o600}); }
        catch(e:any) { if(e.code!=='EEXIST') throw e; }
        this.key=await fs.readFile(path);
        if(this.key.length!==32)throw new Error('Identity encryption key is unavailable');
    }
    digest(value:string) { if(!this.key)throw new Error('Identity vault unavailable');return createHmac('sha256',this.key).update(value).digest('hex'); }
    seal(data:Buffer, owner:string) {
        if(!this.key)throw new Error('Identity vault is unavailable');
        const iv=randomBytes(12),cipher=createCipheriv('aes-256-gcm',this.key,iv);
        cipher.setAAD(Buffer.from(owner));
        const encrypted=Buffer.concat([cipher.update(data),cipher.final()]);
        return Buffer.concat([iv,cipher.getAuthTag(),encrypted]);
    }
    open(data:Buffer, owner:string) {
        if(!this.key || data.length<28)throw new Error('Invalid encrypted identity data');
        const cipher=createDecipheriv('aes-256-gcm',this.key,data.subarray(0,12));
        cipher.setAAD(Buffer.from(owner));cipher.setAuthTag(data.subarray(12,28));
        return Buffer.concat([cipher.update(data.subarray(28)),cipher.final()]);
    }
    private path(owner:string,file:string) {
        if(!/^[a-f0-9-]{36}$/i.test(owner)|| !/^[a-f0-9-]{36}\.bin$/i.test(file))throw new Error('Invalid private identity path');
        return join(this.root,owner,file);
    }
    async write(owner:string,data:Buffer) {
        const file=randomUUID()+'.bin',path=this.path(owner,file);
        await fs.mkdir(join(this.root,owner),{recursive:true,mode:0o700});
        await fs.writeFile(path,this.seal(data,owner),{flag:'wx',mode:0o600});
        return file;
    }
    async read(owner:string,file:string) {return this.open(await fs.readFile(this.path(owner,file)),owner);}
    async remove(owner:string,file:string) {await fs.rm(this.path(owner,file),{force:true});}
}
