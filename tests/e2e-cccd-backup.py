# Kiểm thử trình duyệt (Python + Playwright): nối lại ảnh CCCD khi khôi phục JSON, backup .zip, khôi phục ảnh từ .zip.
# Chạy: env -u GITHUB_TOKEN DB_DRIVER=blob node tests/e2e-server.js  rồi  python3 tests/e2e-cccd-backup.py
import asyncio, json, zipfile, base64
from playwright.async_api import async_playwright
H='http://localhost:4173/'
IMG=base64.b64encode(open(__import__('os').path.join(__import__('os').path.dirname(__file__),'sample-cccd.jpg'),'rb').read()).decode()
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(args=['--no-sandbox','--no-proxy-server'])
        ctx = await b.new_context(viewport={'width':390,'height':844}, accept_downloads=True); pg = await ctx.new_page()
        errs=[]; pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(H+'#/login'); await pg.fill('input[name=password]','MatKhauKiemThu-123'); await pg.click('button:has-text("ĐĂNG NHẬP")'); await pg.wait_for_selector('.room-card')
        api = lambda m,path,body=None: pg.evaluate("""async ([m,path,body])=>{const s=await (await fetch('/api/auth/session')).json(); const r=await fetch('/api/'+path,{method:m,headers:{'Content-Type':'application/json','X-CSRF-Token':s.csrf},body:body?JSON.stringify(body):undefined}); return await r.json();}""",[m,path,body])
        up = lambda owner, side: pg.evaluate("""async ([owner,side,b64])=>{const s=await (await fetch('/api/auth/session')).json(); const bin=Uint8Array.from(atob(b64),c=>c.charCodeAt(0)); const r=await fetch(`/api/storage/upload?ownerId=${owner}&side=${side}`,{method:'POST',headers:{'Content-Type':'image/jpeg','X-CSRF-Token':s.csrf},body:bin}); return (await r.json()).ok;}""",[owner,side,IMG])
        person={'fullName':'Trần Văn Ảnh','dob':'1990-01-01','gender':'male','phone':'0905123456','cccd':'001090000009','cccdIssueDate':'2021-01-01','cccdIssuePlace':'Cục CS','address':'Huế'}
        r = await api('POST','tenants',{'roomId':'room-1','startDate':'2026-11-01','rent':2000000,'elecPrice':3500,'waterPrice':20000,'initElec':1,'initWater':1,'tenant':person,'paidAlready':True,'occupants':[{'fullName':'Người Ở Cùng','dob':'2000-01-01','gender':'female','phone':'0905123457','cccd':'001200000001','address':'Huế'}]})
        tid = r['result']['tenant']['id']; oid = r['result']['occupantIds'][0]
        backupA = await api('GET','backup/export')   # bản sao lưu TRƯỚC khi có ảnh
        print('upload', await up(tid,'front'), await up(tid,'back'), await up(oid,'front'))
        res = await api('POST','backup/restore',{'db':backupA,'confirm':'GHI DE'})
        print('restore images', res.get('images'))
        d = await api('GET','data'); t=[x for x in d['db']['tenants'] if x['id']==tid][0]; print('tenant imgs after restore', bool(t['idImages']['front']), bool(t['idImages']['back']))
        # backup zip ở trang Sao lưu
        await pg.goto(H+'#/backup'); await pg.click('.reload-fab'); await pg.wait_for_timeout(800)
        async with pg.expect_download() as dl:
            await pg.click('button[data-act=cccd-backup]')
        z = await dl.value; path='/tmp/cccd.zip'; await z.save_as(path)
        zf = zipfile.ZipFile(path); print('zip files', zf.namelist()); print('zip ok', zf.testzip())
        # xóa ảnh khỏi kho, rồi khôi phục từ zip
        d = await api('GET','data'); t=[x for x in d['db']['tenants'] if x['id']==tid][0]
        for side in ['front','back']: await api('DELETE','storage/'+t['idImages'][side]['id'])
        d = await api('GET','data'); t=[x for x in d['db']['tenants'] if x['id']==tid][0]; print('after delete', t['idImages'])
        await pg.click('.reload-fab'); await pg.wait_for_timeout(800)
        await pg.set_input_files('form[data-form=cccd-restore] input[name=zip]', path)
        await pg.click('form[data-form=cccd-restore] button[type=submit]'); await pg.wait_for_function("document.querySelector('#cccd-res') && document.querySelector('#cccd-res').textContent.includes('Xong')", timeout=15000)
        print('restore zip msg', await pg.inner_text('#cccd-res'))
        d = await api('GET','data'); t=[x for x in d['db']['tenants'] if x['id']==tid][0]; print('tenant imgs after zip', bool(t['idImages']['front']), bool(t['idImages']['back']))
        await pg.screenshot(path='/tmp/8-cccd-card.png', full_page=True)
        await pg.goto(H+'#/room/room-1'); await pg.wait_for_timeout(600)
        async with pg.expect_download() as dl2:
            await pg.click('button[data-act=cccd-backup-room]')
        z2 = await dl2.value; print('room zip name', z2.suggested_filename)
        print('errors', errs); await b.close()
asyncio.run(main())
