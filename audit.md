# Prompt สำหรับ Codex: ตรวจและแก้ Meetwise ให้ครบทั้ง bug, UX/UI และ consistency

ทำงานใน repository `meetwise-local-sqlite` นี้ต่อจากสถานะปัจจุบัน เป้าหมายคือแก้ปัญหาที่ตรวจพบใน web dashboard และ Chrome extension ให้ใช้งานได้ครบ สอดคล้องกัน และไม่ทำข้อมูลการประชุมสูญหาย

## ข้อกำหนดสำคัญก่อนเริ่ม

- อ่านและทำตาม `AGENTS.md` ก่อนแก้โค้ด
- worktree มีไฟล์ที่ผู้ใช้แก้ค้างอยู่ โดยเฉพาะใน `extension/*` และ `server/services/meetings.ts` ห้ามทับ ย้อน หรือลบงานเดิม ให้แก้ต่อจาก diff ปัจจุบันอย่างระมัดระวัง
- ใช้การเปลี่ยนแปลงให้น้อยที่สุด ห้าม refactor โครงสร้างใหญ่ ห้ามสร้าง abstraction/function/class ใหม่ถ้าไม่จำเป็น
- อย่าเปลี่ยน API contract หรือ schema/database ถ้าแก้ที่ frontend/extension ได้
- แก้ตามลำดับ P0 → P1 → P2 และรันทดสอบหลังแต่ละกลุ่ม อย่าหยุดแค่ build ผ่าน ต้องทดสอบ interaction จริงด้วย mock API

## P0 — ต้องแก้ก่อน เพราะทำให้งานค้างหรือข้อมูลหาย

### 1. คิวอัปโหลดของ extension ประมวลผลเพียงรายการเดียว

ไฟล์หลัก: `extension/background.js`

ปัจจุบัน `processQueue()` เลือกและประมวลผลเพียง item เดียวแล้วจบ หากมีหลายรายการ รายการถัดไปอาจค้างจนกว่าจะมี event อื่นมากระตุ้น

ให้แก้ดังนี้:

- หลังรายการหนึ่งสำเร็จ ให้ประมวลผลรายการที่พร้อมส่งถัดไปต่อโดยอัตโนมัติแบบ sequential
- ความล้มเหลวของรายการหนึ่งต้องไม่ขวางรายการอื่นที่ถึงเวลาส่งแล้ว
- ห้ามเกิด busy loop กับรายการ failed ที่ยังไม่ถึง `nextAttemptAt`
- alarm retry ต้องไม่ถูกเวลาของรายการที่ retry ช้ากว่าทับจนรายการที่ควร retry ก่อนถูกเลื่อน
- เพิ่ม test กรณีมี queued 3 รายการแล้วถูกส่งครบตามลำดับ และกรณีรายการแรก fail แต่รายการถัดไปยังทำงานได้

### 2. รายการ uploaded สะสมจนคิวเต็มถาวร

ปัจจุบัน limit 20 รายการและการคำนวณ bytes นับ item ที่ uploaded แล้วด้วย แต่ไม่มีการ prune/remove รายการสำเร็จรายรายการ ผู้ใช้จึงอาจเจอ “คิวอัปโหลดเต็ม” แม้ไม่มีงานค้าง

ให้แก้แบบ minimal:

- จำกัดประวัติ uploaded ให้เหลือจำนวนเล็กน้อยที่มีประโยชน์ต่อผู้ใช้ หรือ prune อัตโนมัติหลังส่งสำเร็จ
- capacity ต้องพิจารณางานที่ยังต้องส่ง ไม่ควรถูกประวัติสำเร็จเก่ากินจนเต็ม
- UI ยังควรบอกผลสำเร็จล่าสุดได้ แต่ต้องไม่สะสมไม่จำกัด
- เพิ่ม test ยืนยันว่าอัปโหลดสำเร็จต่อเนื่องเกิน 20 ครั้งไม่ทำให้คิวใหม่ถูกปฏิเสธ

### 3. คำพูดซ้ำประโยคเดิมของ speaker เดิมอาจถูกทิ้ง

ไฟล์หลัก: `extension/content.js`

`lastSavedTextBySpeaker` เปรียบเทียบเฉพาะข้อความล่าสุดของ speaker ทำให้คนเดิมพูดประโยคเดียวกันอีกครั้งในคนละช่วงเวลาแล้ว `commitSpeaker()` อาจไม่บันทึกช่วงที่สอง

ให้แก้โดยแยก “DOM caption เดิมที่ scan ซ้ำ” ออกจาก “utterance ใหม่ที่ข้อความเหมือนเดิม” โดยใช้เวลา/ช่วง active หรือ identity ของ caption เท่าที่จำเป็น อย่า dedupe ด้วยข้อความอย่างเดียว และเพิ่ม test อย่างน้อย:

- DOM เดิมถูก scan หลายครั้งต้องไม่สร้าง segment ซ้ำ
- speaker เดิมพูดข้อความเดียวกันสองครั้งคนละช่วง ต้องได้ 2 segments
- ข้อความ caption ที่ค่อย ๆ ต่อท้ายต้องยังรวมเป็น segment เดียว

### 4. การหยุดและส่งอาจค้างที่ “กำลังส่ง…” เมื่อ message ล้มเหลว

ไฟล์หลัก: `extension/content.js`, `extension/popup.js`

- ครอบ `stopAndSend()` และ message listener ให้ตอบกลับ error เสมอเมื่อ `chrome.runtime.sendMessage` reject/throw
- indicator และ popup ต้องออกจากสถานะกำลังส่ง พร้อมแสดง error ที่ผู้ใช้เข้าใจและมีทางลองใหม่
- อย่าทิ้ง payload ที่จับได้เพียงเพราะการส่งเข้าคิวล้มเหลว หากกู้คืนได้ให้เก็บ checkpoint ไว้
- ปุ่ม start/stop/retry/login/save ต้องมี busy state ป้องกัน double click และต้องคืนสถานะใน `finally`

### 5. Dashboard กระพริบ/หายทั้งหน้าในช่วง polling analysis

ไฟล์หลัก: `src/App.tsx`

`loadMeeting()` ตั้ง global `loading=true` และ polling เรียกทุก 3 วินาที ทำให้ dashboard ถูกซ่อนซ้ำ ๆ ระหว่าง `pending/running`

ให้แยก initial/navigation loading ออกจาก background refresh แบบ minimal: polling ต้องอัปเดตข้อมูลและ status โดยไม่ลบเนื้อหาปัจจุบัน ไม่เลื่อน scroll และไม่กระพริบทั้งหน้า เมื่อ polling fail ให้คงข้อมูลล่าสุดและแจ้งเตือนแบบไม่ทำลายหน้า

## P1 — ต้องแก้เพื่อให้ flow ใช้งานจริงไม่ติดขัด

### 6. Pagination ของรายการประชุมถูกละทิ้ง

ไฟล์หลัก: `src/lib/api.ts`, `src/App.tsx`

API ส่ง `nextCursor` แต่ UI ไม่เก็บและไม่มี “โหลดเพิ่ม” ทำให้เห็นเพียงหน้าแรก

- รองรับ cursor โดยคงรายการเดิมแล้ว append รายการใหม่
- มีปุ่ม “โหลดเพิ่มเติม” พร้อม loading/error/retry state
- reset cursor และรายการอย่างถูกต้องเมื่อเปลี่ยน workspace หรือ search
- dedupe meeting ด้วย id
- เพิ่ม test สำหรับ first page, next page, search reset และ no-more-results

### 7. Mobile drawer ไม่ปิดหลังเลือกเมนู และหน้าสมาชิกล้นจอ

ไฟล์หลัก: `src/App.tsx`, `src/styles.css`

ผลทดสอบจริงที่ viewport 390×844:

- กดเมนู “สมาชิก Workspace” แล้ว `.sidebar-drawer.open` และ scrim ยังอยู่ ผู้ใช้เห็น drawer ทับหน้าที่เพิ่งเลือก
- หน้าสมาชิกมี `scrollWidth 523px` ขณะที่ viewport 390px เพราะ `.member-form`/`.member-list` ยังใช้ desktop grid

ให้แก้ดังนี้:

- ทุก navigation ใน drawer ต้องปิด drawer หลังเลือก
- รองรับ Escape, focus management เบื้องต้น และมีปุ่มปิดที่เข้าถึงได้จริง ไม่ถูก drawer บัง
- เมื่อ drawer เปิดให้ป้องกัน background scroll; เมื่อปิดต้องคืน focus ให้ปุ่มเมนู
- ที่ ≤760px ให้ form สมาชิกเรียงแนวตั้งเต็มความกว้าง รายการสมาชิกต้องไม่ล้น ชื่อ/email wrap ได้ และ control มี touch target เหมาะสม
- ตรวจ 320, 390, 760, 1024 และ 1440px โดยต้องไม่มี horizontal overflow

### 8. ข้อมูล analysis มีอยู่แต่ UI แสดงไม่ครบ

ไฟล์หลัก: `src/types.ts`, `src/components/SummaryPanel.tsx`, `src/components/TopicTable.tsx`

- `decisions` และ `actionItems` ถูกส่งมาแล้วแต่ไม่มี section แสดง
- `Topic.speakers[].contribution` ไม่เคยแสดง
- การคลิก topic แค่เปลี่ยนสี selected แต่ chevron ทำให้ผู้ใช้คาดว่าจะเห็นรายละเอียด

ให้เพิ่มส่วน “มติ/การตัดสินใจ” และ “งานที่ต้องทำ” ในพื้นที่สรุป โดยรองรับ owner/task/due และ empty state ที่เหมาะสม เพิ่ม topic detail แบบ inline/expand หรือ panel ที่เห็น summary และ contribution จริง ถ้าจะให้แถวเลือกได้ต้องมีผลลัพธ์ที่มีความหมาย; ถ้าไม่ทำ detail ให้เอา affordance ที่หลอกว่าเปิดต่อได้ออก

### 9. สถานะ analysis และข้อความปุ่มไม่ตรงกับ state

ไฟล์หลัก: `src/components/MeetingHeader.tsx`, `src/components/SummaryPanel.tsx`, `src/styles.css`

- `pending` แสดง “รอการวิเคราะห์” แต่ปุ่ม disabled ยังเขียน “วิเคราะห์ใหม่”
- `failed` ไม่มี visual danger ที่ชัดและ failure reason อยู่ไกลจาก status
- mobile ซ่อน analysis status ทั้งหมด ทำให้ไม่รู้ว่ารอคิว/กำลังทำ/ล้มเหลว/เสร็จแล้ว

กำหนด state ให้สอดคล้องกันทั้ง header, button, summary และ mobile:

- ไม่มี analysis: “ยังไม่ได้วิเคราะห์” / CTA “วิเคราะห์”
- pending: “รอคิววิเคราะห์” / disabled
- running: “กำลังวิเคราะห์…” / disabled พร้อม progress แบบไม่หลอกเปอร์เซ็นต์
- completed: “วิเคราะห์แล้ว” / CTA “วิเคราะห์ใหม่”
- failed: “วิเคราะห์ไม่สำเร็จ” + เหตุผลที่ปลอดภัย / CTA “ลองอีกครั้ง”

### 10. Speaker stats อธิบาย basis ผิดได้

ไฟล์หลัก: `src/components/SpeakerBars.tsx`

type รองรับ `basis: 'duration' | 'spoken_units'` แต่ note เขียนว่าคำนวณจากระยะเวลาเสมอ ให้แสดงคำอธิบายตาม basis จริง จัดรูปแบบ share ให้สม่ำเสมอและไม่ทำ bar ล้นเมื่อค่าอยู่นอกช่วงจากข้อมูลผิดปกติ โดยไม่เพิ่ม defensive logic ฝั่ง server

### 11. Member administration ยังเสี่ยงกดผิดและขาด feedback

ไฟล์หลัก: `src/App.tsx`, `src/styles.css`

- แปล role ให้เป็นภาษาไทยใน label ที่ผู้ใช้เห็น แต่ค่าที่ส่ง API ยังเป็น `owner/admin/member/viewer`
- admin ห้ามเห็นตัวเลือก assign/change `owner` ที่ backend ไม่อนุญาต
- ป้องกันการแก้/ลบ owner ตามสิทธิ์เดียวกับ backend และอธิบายว่าทำไม control disabled
- ลบสมาชิกและเปลี่ยน owner/ลดสิทธิ์ owner ต้องมี confirmation ที่บอกชื่อคนและผลกระทบ
- add/update/delete ต้องมี per-action busy, success และ error feedback; ห้ามกดซ้ำ
- มี loading state และ empty state ของ member list
- error เก่าต้องหายเมื่อ action ใหม่สำเร็จ

### 12. Destructive actions ต้องสอดคล้องกัน

พื้นที่ที่เกี่ยวข้อง: ลบ meeting, revoke sessions, ลบสมาชิก, “ลบ transcript ใน Extension”

- ใช้ confirmation pattern และถ้อยคำแบบเดียวกัน
- บอกให้ชัดว่าลบอะไร, กระทบ server หรือเฉพาะเครื่อง, กู้คืนได้หรือไม่
- `ลบ transcript ใน Extension` ต้องไม่ลบโดยไม่มี confirm และควรใช้คำว่า “ล้างข้อมูลการจับและคิวอัปโหลดในส่วนขยาย” หากนั่นคือสิ่งที่โค้ดลบจริง
- ห้ามออกจาก UI แบบสำเร็จเมื่อ request ล้มเหลว เช่น `logout/revokeAll().finally(setUser(undefined))`; ให้แยกผลสำเร็จและ error อย่างถูกต้อง

### 13. Search และ empty/error state สื่อความหมายผิด

- เมื่อ search ไม่พบ ให้แสดง “ไม่พบการประชุมที่ตรงกับ…” พร้อมปุ่มล้างตัวกรอง ไม่ใช่ข้อความ “ยังไม่มีการประชุมใน workspace นี้”
- แยก initial empty workspace ออกจาก filtered empty
- sidebar search ควรมีปุ่มล้าง, loading และจำนวนผลลัพธ์/สถานะที่พอเข้าใจ
- error banner ต้องปิดได้หรือหายเมื่อ retry สำเร็จ ไม่ค้างเป็น error เก่าข้ามหน้า
- การโหลด meeting ใหม่ไม่ควรลบ meeting เดิมทันที หาก fail ให้คงหน้าปัจจุบันและแจ้ง error

### 14. Health/server state ต้องไม่ทำให้ผู้ใช้เข้าใจผิด

- `/ready` fail ตอนเริ่มต้นไม่ควรแปลว่า “Dependency ยังไม่พร้อม” แบบถาวรโดยไม่มี retry
- แยก “กำลังตรวจ”, “server ติดต่อไม่ได้”, “database ไม่พร้อม”, “Ollama offline/ไม่พบ model” เท่าที่ response มี
- refresh เป็นระยะที่ไม่ถี่เกินไปหรือมีปุ่มลองใหม่
- viewer ไม่ควรเห็นรายละเอียดระบบที่ไม่มีสิทธิ์ แต่ยังควรรู้ว่าฟังก์ชันที่ตนใช้พร้อมหรือไม่
- login bootstrap ที่ `/me` ล้มเหลวเพราะ network/server ต้องแสดง server error ไม่ใช่สรุปทันทีว่า unauthenticated

### 15. เปลี่ยน workspace ต้อง reset state ที่สัมพันธ์กัน

เมื่อเปลี่ยน workspace ให้ตรวจและ reset อย่างเหมาะสม: meeting, selected topic, search/cursor, mobile tab, error และ view ที่ role ใหม่ไม่มีสิทธิ์เข้าถึง ต้องไม่เกิดหน้า meetings ที่ไม่มี nav active หรือค้างหน้า members จาก workspace เก่า และห้ามแสดงข้อมูล workspace เก่าระหว่างโหลด workspace ใหม่

## P2 — เติมความสมบูรณ์และ consistency โดยไม่ขยาย scope เกินจำเป็น

### 16. ทำคำศัพท์และ visual language ให้เป็นชุดเดียวกัน

จัดทำ mapping ในโค้ดหรือ constant ที่มีอยู่แล้วเท่าที่จำเป็น และใช้ถ้อยคำเดียวกันทั้ง dashboard/extension:

- เลือกใช้ “Workspace” หรือ “พื้นที่ทำงาน” แบบเดียวกันทุกหน้า
- เลือก “บันทึกคำบรรยาย” เป็นคำหลัก แทนการสลับ “จับ/บันทึก/capture” ใน UI ภาษาไทย
- ใช้ “เซิร์ฟเวอร์” หรือ “Server” รูปแบบเดียวกัน
- แปล role ที่แสดงต่อผู้ใช้ทั้ง dashboard และ extension
- status คิว: รอส่ง / กำลังส่ง / ส่งไม่สำเร็จ / ส่งสำเร็จ ต้องใช้สีและข้อความชุดเดียวกัน
- ใช้ brand mark เดียวกันหรือทำให้ M ใน extension สอดคล้องกับ waveform mark ของ web
- สีเขียว, danger, border radius, focus ring, disabled และ loading ต้องมีความหมายเดียวกัน

### 17. ปรับ dashboard hierarchy เล็กน้อย

- ชื่อ meeting ยาวต้องไม่แย่งพื้นที่ action บน desktop และไม่ดัน mobile จนแน่นเกินไป
- บน mobile อย่าซ่อนจำนวนผู้พูดและ analysis status ทั้งหมด ให้จัดลำดับข้อมูลสำคัญใหม่
- ชื่อ speaker ยาวต้อง truncate/wrap อย่างอ่านได้ใน bar, filter chip และ transcript โดยไม่ทำ column ข้อความแคบผิดปกติ
- หน้า settings และ members ควรมี heading, description, spacing, button styles และ feedback pattern เดียวกับ meeting dashboard ไม่ใช่หน้าดิบคนละระบบ
- server/Ollama labels และค่าควรจัดเป็น status list/card ที่อ่านง่าย ไม่ใช้ `dl` ที่ดูเหมือนข้อความดิบ

### 18. Accessibility ที่ต้องเพิ่ม

- mobile tabs ต้องมี `id`, `aria-controls`, `role=tabpanel`, `aria-labelledby` และ keyboard ArrowLeft/ArrowRight/Home/End
- topic row ที่ expand ต้องมี `aria-expanded/aria-controls`
- filter speaker ใช้ pressed/selected semantics เช่น `aria-pressed`
- icon-only delete ต้องมี tooltip หรือ visible context นอกเหนือจาก aria-label
- ประกาศผล async ผ่าน `role=status`/`aria-live` โดยไม่ประกาศ polling ซ้ำรบกวน screen reader
- focus ต้องไปยัง heading/content ที่เหมาะสมหลังเปลี่ยนหน้า และกลับสู่ trigger หลังปิด drawer/dialog
- ตรวจ contrast, focus-visible, touch target อย่างน้อย 44px ใน mobile

### 19. ฟีเจอร์เล็กที่ควรมีเพื่อให้ flow จบ

ทำเฉพาะเมื่อ P0/P1 เสร็จและไม่ต้องเปลี่ยน backend:

- ปุ่ม copy สรุป, action items หรือ transcript พร้อม feedback “คัดลอกแล้ว”
- แสดง model/analyzed time/source แบบ metadata ที่ไม่รบกวนเนื้อหาหลัก
- extension แสดงเวลาที่กำลังบันทึกและบอกชัดว่าต้องเปิด Google Meet + captions ก่อน
- queue มี action รายรายการที่เหมาะสม: retry failed และลบรายการที่ไม่ต้องการ โดย destructive action ต้อง confirm
- indicator บนหน้า Google Meet ไม่ควรค้าง “Meetwise หยุดแล้ว” บังหน้าจอตลอดเวลา; แสดงเมื่อกำลังจับ/ส่ง/error หรือให้ dismiss ได้
- empty meeting state มีขั้นตอนสั้น ๆ: ติดตั้ง/เปิด extension → เปิด captions → เริ่มบันทึก → หยุดและส่ง

ยังไม่ต้องเพิ่ม password reset, email invitation หรือ OIDC เพราะ README ระบุเป็น known limitations และต้องเปลี่ยน scope/backend มาก

## Test และ acceptance criteria

เพิ่ม/ปรับ test ให้ครอบคลุม regression ข้างต้น

ต้องผ่านอย่างน้อย:

```text
npm run lint
npm run typecheck
npm test
npm run build
```

จากนั้นทดสอบ rendered UI ด้วย Playwright และ mock API ที่ desktop 1440×960, tablet 760px, mobile 390×844 และ 320px โดยตรวจ:

1. login success/error/network error และป้องกัน double submit
2. โหลด meeting, เปลี่ยน meeting และ polling analysis โดยหน้าไม่กระพริบ
3. analysis ทั้ง 5 state: none/pending/running/completed/failed
4. summary/decisions/action items/topic detail แสดงข้อมูลครบ
5. search no-result/clear, transcript search และ speaker filter
6. pagination append/reset/dedupe
7. mobile tabs ใช้ mouse/touch/keyboard ได้
8. drawer ปิดหลัง navigation, Escape ได้, focus กลับถูกจุด
9. members add/update/delete/error/permission และ responsive
10. workspace switch owner → viewer และ viewer → owner ไม่มี state เก่ารั่ว
11. destructive confirmations และ request failure ไม่แกล้งแสดงว่าสำเร็จ
12. extension login, capture start/stop/error, multi-item queue, retry และ clear local data
13. ไม่มี relevant console error, framework overlay หรือ horizontal overflow
14. `prefers-reduced-motion` ยังทำงาน

เพิ่ม unit test สำหรับ extension queue/caption logic ให้ชัดเจน โดยเฉพาะ multi-item drain, queue retention และ repeated identical utterance อย่าพึ่ง browser test เพียงอย่างเดียว

## สิ่งที่ตรวจแล้วก่อนเริ่มงานนี้

- `npm run lint` ผ่าน
- `npm run typecheck` ผ่าน
- `npm test` ผ่าน 7 files / 16 tests
- `npm run build` ผ่าน
- Render ด้วย mock API ไม่มี relevant console error ที่ desktop/mobile
- พบหลักฐานจริงว่า mobile members overflow: `scrollWidth=523`, `clientWidth=390`
- พบหลักฐานจริงว่าเลือกหน้า members จาก drawer แล้ว drawer/scrim ยังเปิดอยู่
- พบว่า API response มี `nextCursor` แต่ UI ไม่มี pagination
- พบว่า topic selection ไม่แสดง contribution และ mobile ไม่มี `role=tabpanel`

## รูปแบบส่งมอบ

เมื่อแก้เสร็จให้สรุป:

- แก้ P0/P1/P2 ข้อใดบ้าง พร้อมไฟล์หลัก
- สิ่งที่ตั้งใจยังไม่ทำและเหตุผล
- ผลคำสั่ง test/build ทุกคำสั่ง
- flow และ viewport ที่ทดสอบจริง
- console/accessibility/responsive ที่ยังมีความเสี่ยง
- ห้ามอ้างว่าเสร็จหากเพียง build ผ่านแต่ยังไม่ได้ทดสอบ interaction
