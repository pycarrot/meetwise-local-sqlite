# Meetwise Implementation Tasks

เอกสารนี้แตกงานจาก `audit.md` เป็น task ที่ลงมือทำและตรวจรับได้ทีละส่วน สำหรับ web dashboard และ Chrome extension

## กติกาการทำงาน

- [x] อ่าน `AGENTS.md` และ `audit.md` ก่อนเริ่ม
- [ ] โปรเจคนี้สามารถเข้าถึงฐานข้อมูล sqlite ได้เต็มที่
- [x] ใช้ mock/stub/fixture สำหรับ test ที่ต้องมี meeting, member, workspace หรือ analysis data
- [x] ตรวจ `git status --short` ก่อนแก้ และรักษาไฟล์ที่ผู้ใช้แก้ค้างไว้
- [x] ห้าม reset, checkout หรือย้อน diff เดิมของผู้ใช้
- [x] แก้ด้วย diff เล็กที่สุด ห้าม refactor หรือสร้าง abstraction ใหม่ถ้าไม่จำเป็น
- [x] หลีกเลี่ยงการเปลี่ยน API contract, database schema และ migration
- [x] ทำตามลำดับ P0 → P1 → P2 โดย task ที่มี dependency ต้องรอ task ต้นทางก่อน
- [x] หลังแต่ละ task ให้รัน test ที่เกี่ยวข้องทันที ไม่รอรวมท้ายงาน
- [x] ห้ามถือว่าเสร็จเพียงเพราะ build ผ่าน ต้องตรวจ interaction และ rendered UI ด้วย

## Definition of Done รวม

งานทั้งหมดถือว่าเสร็จเมื่อ:

- [x] P0 และ P1 ทุกข้อผ่าน acceptance criteria
- [x] P2 ที่เลือกทำถูกระบุชัดเจน ส่วนที่ไม่ทำมีเหตุผล
- [x] ไม่มี regression กับ dirty changes เดิมของผู้ใช้
- [x] `npm run lint` ผ่าน
- [x] `npm run typecheck` ผ่าน
- [x] `npm test` ผ่าน
- [x] `npm run build` ผ่าน
- [x] browser QA ด้วย mock API ผ่านที่ 320, 390, 760, 1024 และ 1440px
- [x] ไม่มี relevant console error, framework overlay หรือ horizontal overflow
- [x] สรุปไฟล์ที่แก้ ผล test และ remaining risks ใน final response

---

# Phase 0 — Baseline และ test harness

## TASK-001: บันทึก baseline และขอบเขตไฟล์

Priority: P0  
Dependencies: ไม่มี  
Expected code change: ไม่มี

### ขั้นตอน

- [x] รัน `git status --short` และจดรายการไฟล์ dirty เดิม
- [x] อ่าน diff ของไฟล์ที่จะต้องแก้ โดยเฉพาะ:
  - [x] `extension/background.js`
  - [x] `extension/content.js`
  - [x] `extension/popup.js`
  - [x] `extension/popup.html`
  - [x] `extension/popup.css`
  - [x] `server/services/meetings.ts`
- [ ] รัน baseline commands:
  - [x] `npm run lint`
  - [x] `npm run typecheck`
  - [ ] `npm test`
  - [x] `npm run build`
- [ ] บันทึกจำนวน test และ failure ที่มีอยู่ก่อนแก้

### Acceptance criteria

- [x] มี baseline ที่เปรียบเทียบกับผลหลังแก้ได้
- [x] ระบุได้ว่า diff ใดเป็นของผู้ใช้เดิมและ diff ใดเกิดจากงานนี้
- [ ] ไม่มีไฟล์เดิมถูกเปลี่ยนใน task นี้

## TASK-002: เตรียม extension test harness ที่ไม่ใช้ Chrome/DB จริง

Priority: P0  
Dependencies: TASK-001  
Files: ใช้ test files ที่มีอยู่ หรือเพิ่ม test file ขนาดเล็กใกล้ `extension/lib.test.js`

### เป้าหมาย

ทำให้ queue และ caption logic ทดสอบแบบ deterministic ได้ โดยไม่เปิด Google Meet จริง ไม่เรียก server จริง

### ขั้นตอน

- [x] ตรวจ test pattern ปัจจุบันใน `extension/lib.test.js`
- [x] mock เฉพาะ Chrome APIs ที่จำเป็น เช่น:
  - [x] `chrome.storage.local`
  - [x] `chrome.alarms`
  - [x] `chrome.runtime.sendMessage`
  - [x] `chrome.runtime.onMessage`
- [x] mock `fetch`, เวลา และ UUID เฉพาะ test ที่จำเป็น
- [x] ทำให้ test reset storage, timers และ listeners ระหว่าง case
- [x] ห้ามเพิ่ม dependency ใหม่หาก Vitest ที่มีอยู่ทำได้
- [x] หากต้อง expose logic เพื่อ test ให้ใช้การเปลี่ยนแปลงเล็กที่สุดและไม่เปลี่ยน runtime behavior

### Acceptance criteria

- [x] test ไม่เรียก network จริง
- [x] test ไม่อ่านหรือเขียน database
- [x] test สามารถจำลอง queued/uploading/failed/uploaded ได้
- [x] test สามารถจำลอง caption scan และ stop/send error ได้
- [x] test เดิมยังผ่าน

---

# Phase 1 — P0: ป้องกันงานค้างและข้อมูลสูญหาย

## TASK-101: ทำให้ upload queue drain ต่อเนื่อง

Priority: P0  
Dependencies: TASK-002  
Files: `extension/background.js`, extension tests

### ปัญหา

`processQueue()` ประมวลผล eligible item เพียงรายการเดียวแล้วจบ รายการถัดไปจึงอาจค้างจนเกิด startup, alarm, retry หรือ enqueue รอบใหม่

### ขั้นตอน

- [x] เปลี่ยน queue processing ให้ทำทีละรายการแบบ sequential
- [x] หลังรายการสำเร็จ ให้หา eligible item ถัดไปและทำต่อ
- [x] หากรายการหนึ่งล้มเหลว ให้บันทึก failed state แล้วทำรายการ eligible อื่นต่อ
- [x] ห้ามเลือก failed item ที่ `nextAttemptAt > Date.now()`
- [x] ห้าม recursive loop ที่โตตามจำนวน queue หาก loop ธรรมดาทำได้
- [x] รักษา `processing` guard เพื่อไม่ให้ worker ซ้อนกัน
- [x] ทุก state transition ต้องถูก persist ก่อนทำขั้นต่อไป
- [x] เมื่อไม่มี eligible item ให้จบโดยไม่สร้าง timer loop
- [x] ตรวจว่า retry handler ที่ `await processQueue()` ไม่ deadlock กับ `processing`

### Tests

- [x] queued 3 รายการ → fetch สำเร็จทั้งหมด → uploaded ครบตามลำดับ
- [x] รายการแรก fail, รายการที่สอง/สามสำเร็จ → รายการหลังไม่ถูก block
- [x] failed item ที่ยังไม่ถึงเวลา retry → ไม่ถูกเรียกซ้ำ
- [x] เรียก `processQueue()` ซ้อนกัน → ไม่มี duplicate upload
- [x] idempotency key ของแต่ละรายการยังถูกส่งเหมือนเดิม

### Acceptance criteria

- [x] ไม่มี queued item ที่พร้อมส่งค้างหลัง processor จบ
- [x] ไม่มี busy loop
- [x] ไม่มี upload ซ้ำจาก concurrent processor
- [x] error metadata เดิม (`errorCode`, `requestId`) ยังทำงาน

## TASK-102: จัด retry alarm ตามเวลาที่เร็วที่สุด

Priority: P0  
Dependencies: TASK-101  
Files: `extension/background.js`, extension tests

### ขั้นตอน

- [x] หลัง queue เปลี่ยน ให้หาค่า `nextAttemptAt` ที่เร็วที่สุดของรายการที่ต้อง retry
- [x] สร้าง/อัปเดต alarm ให้ตรงเวลาที่เร็วที่สุด
- [x] อย่าให้ failure ที่เกิดทีหลังแต่ retry ช้ากว่าทับ alarm ของรายการก่อนหน้า
- [x] หากไม่มีรายการรอ retry ให้ไม่สร้าง alarm ที่ไม่จำเป็น
- [x] alarm trigger แล้วต้อง drain eligible queue ทั้งหมดตาม TASK-101

### Tests

- [x] มี failed items เวลา 10:05, 10:02, 10:10 → alarm เป็น 10:02
- [x] เพิ่ม failed item เวลา 10:08 → alarm เดิม 10:02 ไม่ถูกเลื่อน
- [x] retry สำเร็จหมด → ไม่มี stale alarm ที่ทำให้ upload ซ้ำ

### Acceptance criteria

- [x] รายการที่ควร retry ก่อนถูกปลุกก่อนเสมอ
- [x] alarm ไม่ทำให้เกิด duplicate processing

## TASK-103: ป้องกัน uploaded history ทำให้คิวเต็ม

Priority: P0  
Dependencies: TASK-101  
Files: `extension/background.js`, `extension/popup.js`, extension tests

### ขั้นตอน

- [x] กำหนด retention ของ uploaded history แบบ bounded เช่นเก็บเฉพาะรายการสำเร็จล่าสุดจำนวนน้อย
- [x] pending/queued/uploading/failed ต้องไม่ถูก prune โดยอัตโนมัติ
- [x] capacity count และ byte calculation ต้องสะท้อนรายการที่ยังต้องเก็บ/ส่งจริง
- [x] prune ในจุดเดียวที่ชัดเจน เช่นก่อน persist หลัง upload หรือก่อน enqueue
- [x] popup ยังแสดงผลสำเร็จล่าสุดได้
- [x] queue summary ต้องนับ pending/uploaded หลัง prune อย่างถูกต้อง
- [x] อย่าเปลี่ยน payload หรือ idempotency semantics

### Tests

- [x] uploaded ต่อเนื่องเกิน 20 รายการ → enqueue รายการใหม่ได้
- [x] failed 20 รายการ → ยังถูกจำกัดเพื่อป้องกัน storage เต็ม
- [x] prune ไม่ลบ queued/uploading/failed
- [x] retained uploaded items เรียงล่าสุดก่อนตาม UI เดิม

### Acceptance criteria

- [x] คิวไม่เต็มเพราะประวัติสำเร็จเก่าอย่างเดียว
- [x] ผู้ใช้ยังเห็น success history ล่าสุดใน popup
- [x] storage ไม่โตไม่จำกัด

## TASK-104: แก้ caption dedupe ไม่ให้ทิ้ง utterance ที่ข้อความเหมือนเดิม

Priority: P0  
Dependencies: TASK-002  
Files: `extension/content.js`, extension tests

### ปัญหา

การใช้ `lastSavedTextBySpeaker` ทำให้ speaker คนเดิมพูดประโยคเดิมในคนละช่วงแล้ว segment หลังอาจหาย

### ขั้นตอน

- [x] ระบุ lifecycle ของ caption เดิม: เริ่ม → ต่อข้อความ → จบ/หาย → utterance ใหม่
- [x] dedupe การ scan DOM เดิมซ้ำโดยไม่ใช้ข้อความอย่างเดียว
- [x] ยังคงการรวมข้อความกรณี caption ใหม่ขึ้นต้นด้วยข้อความ active เดิม
- [x] commit active segment เมื่อมีหลักฐานว่า utterance เดิมจบตามพฤติกรรม DOM ที่มี
- [x] speaker เดิมกลับมาพูดข้อความเดิมภายหลังต้องสร้าง segment ใหม่
- [x] checkpoint/restore ต้องยัง serialize state ที่จำเป็นได้
- [x] หลีกเลี่ยงการเพิ่ม polling หรือ storage write ที่ถี่กว่าเดิม

### Tests

- [x] scan DOM node/ข้อความเดิมหลายครั้ง → 1 segment
- [x] `สวัสดี` → `สวัสดีทุกคน` → 1 segment ที่ข้อความสมบูรณ์
- [x] speaker A พูด `รับทราบ`, speaker B พูด, speaker A พูด `รับทราบ` → A ได้ 2 segments
- [x] speaker A มี caption หายแล้วกลับมาด้วยข้อความเดิม → ได้ segment ใหม่
- [x] stop capture commit active speakers ทุกคน
- [x] checkpoint restore แล้วไม่ duplicate segment เดิม

### Acceptance criteria

- [x] ไม่สูญเสีย repeated utterance
- [x] ไม่สร้าง segment ซ้ำจาก MutationObserver scan เดิม
- [x] เวลา start/end ยัง monotonic และ end มากกว่า start ตามเงื่อนไขเดิม

## TASK-105: ทำ stop-and-send ให้ recover เมื่อ runtime/message ล้มเหลว

Priority: P0  
Dependencies: TASK-104  
Files: `extension/content.js`, `extension/popup.js`, extension tests

### ขั้นตอน

- [x] ครอบ `chrome.runtime.sendMessage` ใน `stopAndSend()` ด้วย error handling
- [x] listener ของ `MEETWISE_STOP` ต้องเรียก `sendResponse` ทั้ง success และ failure
- [x] response error ต้องมี `{ ok: false, error: string }` ที่ popup ใช้ได้
- [x] เมื่อ enqueue/send ล้มเหลว ให้ indicator ออกจาก “กำลังส่ง…”
- [x] เก็บ checkpoint/payload ที่จำเป็นสำหรับ retry แทนการลบทิ้งทันที
- [x] ระบุ state หลัง failure ให้ชัด: หยุดแล้วแต่ยังส่งไม่สำเร็จ หรือกลับมาพร้อม retry
- [x] popup แสดง error ใกล้ capture control ไม่ใช่เปลี่ยน server health เป็น error คนละเรื่อง
- [x] retry สำเร็จแล้วต้องอัปเดต queue/capture state

### Tests

- [x] sendMessage resolve `{ok:true}` → แสดงเข้าคิวแล้ว
- [x] sendMessage resolve `{ok:false}` → แสดง error และไม่ค้าง loading
- [x] sendMessage reject → listener ยังตอบและ UI recover
- [x] ไม่มี captions → แสดงคำอธิบายและไม่สร้าง payload ว่าง
- [x] failure แล้วเปิด popup ใหม่ → checkpoint ที่กู้ได้ยังอยู่

### Acceptance criteria

- [x] ไม่มี unhandled promise rejection
- [x] ไม่มีสถานะ “กำลังส่ง…” ค้างถาวร
- [x] transcript ที่ยังส่งไม่สำเร็จไม่ถูกทิ้งโดยไม่มีทางกู้

## TASK-106: เพิ่ม busy/error state ให้ async actions ใน popup

Priority: P0  
Dependencies: TASK-105  
Files: `extension/popup.js`, `extension/popup.html`, `extension/popup.css`

### Actions ที่ต้องตรวจ

- [x] login
- [x] save server URL
- [x] start capture
- [x] stop/send
- [x] retry queue item
- [x] logout
- [x] clear local data
- [x] open dashboard หากส่ง message ล้มเหลว

### ขั้นตอน

- [x] disable control ระหว่าง request
- [x] เปลี่ยน label เฉพาะที่ช่วยให้รู้ว่ากำลังทำอะไร
- [x] คืน label/disabled state ใน `finally`
- [x] ห้าม double-submit/double-capture
- [x] catch runtime rejection ทุก action
- [x] ใช้ announcement/capture/queue error area ให้ตรงประเภทของ error
- [x] success feedback ต้องไม่ถูก `load()` ทับก่อนผู้ใช้รับรู้

### Acceptance criteria

- [x] กดซ้ำเร็ว ๆ ไม่สร้าง request ซ้ำ
- [x] ทุก failure มีข้อความและทาง retry
- [x] control ไม่ค้าง disabled หลัง failure

## TASK-107: แยก background polling ออกจาก page loading

Priority: P0  
Dependencies: TASK-001  
Files: `src/App.tsx`, `src/App.test.tsx`

### ขั้นตอน

- [x] แยก initial auth/loading, meeting navigation loading และ background refresh state เท่าที่จำเป็น
- [x] polling `pending/running` ต้องไม่ตั้ง global loading ที่ซ่อน dashboard
- [x] background response อัปเดต meeting/status โดยรักษา scroll และ selected tab/topic หากข้อมูลยัง valid
- [x] polling failure ต้องคง meeting ล่าสุด
- [x] หลีกเลี่ยง error banner ซ้ำทุก 3 วินาที
- [x] หยุด interval เมื่อ meeting เปลี่ยน, status จบ หรือ component unmount
- [x] ป้องกัน stale response ของ meeting เก่าทับ meeting ใหม่

### Tests

- [x] pending → running → completed โดย dashboard ไม่หาย
- [x] polling fail หนึ่งครั้ง → meeting เดิมยังแสดง
- [x] เปลี่ยน meeting ระหว่าง request → response เก่าไม่ทับ meeting ใหม่
- [x] completed/failed → ไม่มี polling ต่อ
- [x] unmount → interval ถูก clear

### Acceptance criteria

- [x] ไม่มี full-page flicker ทุก 3 วินาที
- [x] ไม่มี stale meeting race
- [x] polling ไม่รบกวนการค้นหา transcript หรือ mobile tab ปัจจุบัน

---

# Phase 2 — P1: Navigation, responsive และข้อมูลที่แสดงไม่ครบ

## TASK-201: รองรับ meeting pagination

Priority: P1  
Dependencies: TASK-107  
Files: `src/lib/api.ts`, `src/App.tsx`, `src/App.test.tsx`, `src/styles.css`

### ขั้นตอน

- [x] เพิ่ม cursor argument ใน `api.meetings()` โดยรักษา search/speaker params เดิม
- [x] เก็บ `nextCursor` ใน state
- [x] initial/search/workspace load ต้อง replace list
- [x] “โหลดเพิ่มเติม” ต้อง append list
- [x] dedupe ด้วย meeting id
- [x] disable ปุ่มระหว่างโหลดเพิ่ม
- [x] แสดง retry เฉพาะ pagination error โดยไม่ลบรายการเดิม
- [x] ซ่อนปุ่มเมื่อ `nextCursor === null`
- [x] reset cursor/list เมื่อ workspace หรือ search เปลี่ยน
- [x] ป้องกัน response ของ query เก่าทับ query ใหม่

### Tests

- [x] first page มี cursor → เห็นปุ่มโหลดเพิ่มเติม
- [x] click → append second page
- [x] id ซ้ำระหว่างหน้า → แสดงครั้งเดียว
- [x] second page fail → first page ยังอยู่และ retry ได้
- [x] เปลี่ยน search → list/cursor reset
- [x] เปลี่ยน workspace → ห้าม append ข้าม workspace

### Acceptance criteria

- [x] ผู้ใช้เข้าถึง meeting ได้เกินหน้าแรก
- [x] ไม่มี duplicate หรือ cross-workspace item

## TASK-202: ปิด mobile drawer หลัง navigation

Priority: P1  
Dependencies: TASK-001  
Files: `src/App.tsx`, `src/styles.css`, `src/App.test.tsx`

### ขั้นตอน

- [x] navigation “การประชุม”, “สมาชิก Workspace”, “บัญชีและระบบ” ปิด drawer
- [x] meeting link ยังคงปิด drawerหลังโหลดตามเดิม
- [x] scrim ปิด drawer
- [x] Escape ปิด drawer
- [x] เพิ่ม close control ที่กดได้จริงและไม่ถูก drawer บัง
- [x] เปิด drawer แล้ว focus ไปจุดที่เหมาะสม
- [x] ปิด drawer แล้ว focus กลับ menu trigger
- [x] lock background scroll ขณะ drawer เปิดและคืนค่าเมื่อปิด/unmount
- [x] scrim ไม่ควรถูกอ่านเป็น navigation content

### Tests

- [x] เปิด drawer → เลือก members → drawer/scrim หาย
- [x] เปิด drawer → Escape → drawer/scrim หายและ focus กลับ
- [x] เปิด/ปิดหลายครั้ง → body scroll ไม่ค้าง locked
- [x] desktop >760px ไม่ได้รับผลกระทบ

### Acceptance criteria

- [x] หน้าใหม่ไม่ถูก drawer ทับหลัง navigation
- [x] keyboard-only user ปิด drawer ได้

## TASK-203: แก้ responsive ของ MemberAdmin

Priority: P1  
Dependencies: TASK-202  
Files: `src/styles.css`, อาจแตะ markup ใน `src/App.tsx` เท่าที่จำเป็น

### ขั้นตอน

- [x] ที่ ≤760px เปลี่ยน `.member-form` เป็น 1 column
- [x] email input, role select และ submit button กว้างเต็มพื้นที่ที่เหมาะสม
- [x] `.member-list > div` จัด layout ใหม่ไม่ให้ control หลุดจอ
- [x] ชื่อและ email wrap/ellipsis โดยไม่ดัน select/delete ออกนอก viewport
- [x] delete button มี touch target อย่างน้อย 44px
- [x] admin panel margin/padding เหมาะกับ 320/390px
- [x] ตรวจ select native ไม่สร้าง min-width เกิน card
- [x] ตรวจ error/success banner ไม่เพิ่ม horizontal overflow

### Tests

- [x] 320px: `scrollWidth === clientWidth`
- [x] 390px: `scrollWidth === clientWidth`
- [x] 760px: layout ไม่กระโดดหรือซ้อน
- [x] long display name/email/translated role ไม่ล้น
- [x] 1440px: desktop layout เดิมยังอ่านง่าย

### Acceptance criteria

- [x] ไม่มี horizontal overflow ทุก viewport ที่กำหนด
- [x] ทุก member action ใช้งานได้บน touch screen

## TASK-204: แสดง decisions และ action items

Priority: P1  
Dependencies: TASK-107  
Files: `src/components/SummaryPanel.tsx`, `src/styles.css`, component tests

### ขั้นตอน

- [x] แสดง summary เดิม
- [x] เพิ่ม section “มติ/การตัดสินใจ” เมื่อมี `decisions`
- [x] เพิ่ม section “งานที่ต้องทำ” เมื่อมี `actionItems`
- [x] action item แสดง task เป็นข้อมูลหลัก และ owner/due เป็น metadata
- [x] ค่า owner/due ว่างต้องไม่สร้าง label เปล่า
- [x] ไม่แสดง empty box หลายชุดระหว่าง pending/running/failed
- [x] failed reason ต้องยังเห็นและไม่ถูก section ว่างกลบ
- [x] mobile layout อ่านง่ายและไม่ยาวเกินโดยไม่จำเป็น

### Tests

- [x] completed พร้อมข้อมูลครบ → แสดงทั้ง 3 sections
- [x] completed มี summary อย่างเดียว → ไม่แสดง heading ว่าง
- [x] action item บาง field ว่าง → markup ยังถูกต้อง
- [x] pending/running/failed/none → empty/status copy ถูกต้อง

### Acceptance criteria

- [x] analysis data ที่ backend ส่งมาไม่ถูกซ่อนไว้โดยไม่มีเหตุผล

## TASK-205: ทำ Topic selection ให้มีความหมาย

Priority: P1  
Dependencies: TASK-204  
Files: `src/components/TopicTable.tsx`, `src/App.tsx`, `src/styles.css`

### ทางเลือกที่แนะนำ

ใช้ inline expand ต่อ topic เพื่อให้ diff เล็กและ responsive ง่าย

### ขั้นตอน

- [x] click topic แล้วแสดง summary แบบเต็ม
- [x] แสดง speaker contribution ทุกคนใน topic
- [x] click topic เดิมซ้ำเพื่อ collapse หรือกำหนด behavior ที่สม่ำเสมอ
- [x] chevron เปลี่ยนทิศตาม expanded state
- [x] เพิ่ม `aria-expanded` และ `aria-controls`
- [x] detail container มี id และ semantics ที่สัมพันธ์กับ trigger
- [x] keyboard Enter/Space ทำงานผ่าน native button
- [x] เมื่อเปลี่ยน meeting ให้ selected/expanded topic reset อย่างถูกต้อง
- [x] เมื่อ topic list เปลี่ยนจาก polling ให้ selected topic ที่หายไปถูก reset

### Tests

- [x] click topic → contribution ปรากฏ
- [x] click อีกครั้ง → collapse
- [x] เปลี่ยน meeting → detail เก่าไม่ค้าง
- [x] topic ไม่มี speakers → detail ยังไม่พัง

### Acceptance criteria

- [x] ไม่มี chevron/selected state ที่คลิกแล้วไม่เกิดข้อมูลใหม่

## TASK-206: ทำ analysis status state machine ให้ข้อความตรงกัน

Priority: P1  
Dependencies: TASK-107, TASK-204  
Files: `src/components/MeetingHeader.tsx`, `src/components/SummaryPanel.tsx`, `src/styles.css`

### State mapping

- [x] `analysis === null`: “ยังไม่ได้วิเคราะห์” / ปุ่ม “วิเคราะห์”
- [x] `pending`: “รอคิววิเคราะห์” / ปุ่ม disabled “รอคิว…”
- [x] `running`: “กำลังวิเคราะห์…” / ปุ่ม disabled
- [x] `completed`: “วิเคราะห์แล้ว” / ปุ่ม “วิเคราะห์ใหม่”
- [x] `failed`: “วิเคราะห์ไม่สำเร็จ” / ปุ่ม “ลองอีกครั้ง”

### ขั้นตอน

- [x] ใช้ mapping เดียวกันใน header, CTA และ summary โดยไม่จำเป็นต้องสร้าง abstraction ใหญ่
- [x] failed status ใช้ danger styling และแสดง failure reason ที่ปลอดภัย
- [x] `analyzing` local state ต้องไม่ขัดกับ server status
- [x] ปุ่ม disabled มี cursor และ aria state ที่เหมาะสม

### Tests

- [x] render ทั้ง 5 states แล้วข้อความ/ปุ่มตรงตาม mapping
- [x] failed → click retry → busy → pending
- [x] viewer ไม่เห็น CTA แต่ยังเห็น status

### Acceptance criteria

- [x] ไม่มี state ที่ปุ่มเขียน “วิเคราะห์ใหม่” ทั้งที่กำลังรอคิว

## TASK-207: แสดง speaker calculation basis ให้ถูกต้อง

Priority: P1  
Dependencies: ไม่มี  
Files: `src/components/SpeakerBars.tsx`, component tests

### ขั้นตอน

- [x] `duration` แสดงว่าอิงระยะเวลาคำบรรยาย
- [x] `spoken_units` แสดงว่าอิงหน่วยคำพูด/ข้อมูลที่ระบบใช้จริง
- [x] หาก speakers มี basis ไม่ตรงกัน ให้เลือกคำอธิบายที่ไม่ทำให้เข้าใจผิด
- [x] format share ให้สม่ำเสมอ เช่นจำนวนทศนิยมที่จำเป็นเท่านั้น
- [x] จำกัด visual bar width ที่ 0–100 โดยไม่แก้ค่าฝั่ง server
- [x] accessible text ยังคงแสดงค่าจริงที่ format แล้ว

### Tests

- [x] duration และ spoken_units แสดง note คนละแบบ
- [x] share ทศนิยม format สม่ำเสมอ
- [x] share ต่ำกว่า 0/สูงกว่า 100 ไม่ทำ layout ล้น

---

# Phase 3 — P1: Permission, destructive actions และ state consistency

## TASK-301: ทำ role options ให้ตรง backend permission

Priority: P1  
Dependencies: TASK-203  
Files: `src/App.tsx`, อาจใช้ `src/i18n/th.ts`, tests

### ขั้นตอน

- [x] ทำ display label ภาษาไทยสำหรับ owner/admin/member/viewer โดย API value ไม่เปลี่ยน
- [x] owner เห็น role options ที่ตน assign ได้
- [x] admin ไม่เห็น option assign `owner`
- [x] admin แก้หรือลบ existing owner ไม่ได้
- [x] current owner ที่ไม่ควรถูกลดสิทธิ์/ลบตาม owner safety มี disabled state และคำอธิบาย
- [x] UI permission ต้องไม่กว้างกว่า backend
- [x] อย่าคัดลอก permission logic ฝั่ง server มากเกินจำเป็น ใช้ role ที่ response มี

### Tests

- [x] owner add/change role ได้ตามที่อนุญาต
- [x] admin ไม่มี owner option และแก้ owner ไม่ได้
- [x] member/viewer ไม่เห็น MemberAdmin navigation
- [x] API 403 ยังแสดง error ที่เข้าใจได้หาก state เปลี่ยนระหว่างหน้าเปิดอยู่

### Acceptance criteria

- [x] UI ไม่เสนอ action ที่ backend จะ reject แน่นอน

## TASK-302: เพิ่ม per-action state ใน MemberAdmin

Priority: P1  
Dependencies: TASK-301  
Files: `src/App.tsx`, `src/styles.css`, tests

### ขั้นตอน

- [x] member list มี loading state ตอน fetch
- [x] member list ว่างมี empty state
- [x] add member มี busy state และป้องกัน submit ซ้ำ
- [x] update role disable เฉพาะ row ที่กำลังทำ
- [x] delete disable เฉพาะ row ที่กำลังทำ
- [x] success แล้ว clear error เก่า
- [x] error แล้วคืน control state และคงข้อมูลเดิม
- [x] update fail ต้องคืน select เป็น role เดิม หรือ reload canonical state
- [x] แสดง success feedback แบบไม่รบกวนมากเกินไป

### Tests

- [x] slow load → loading state
- [x] add success/fail/double click
- [x] update success/fail และ select rollback
- [x] delete success/fail
- [x] action row หนึ่งไม่ disable ทุก row โดยไม่จำเป็น

### Acceptance criteria

- [x] ผู้ใช้รู้ว่า action ใดกำลังทำและผลเป็นอย่างไร

## TASK-303: สร้าง confirmation pattern สำหรับ destructive actions

Priority: P1  
Dependencies: TASK-302  
Files: `src/App.tsx`, `extension/popup.js`, copy/style ที่เกี่ยวข้อง

### Actions

- [x] ลบ meeting
- [x] ลบ member
- [x] ลดสิทธิ์/เปลี่ยน owner ในกรณีเสี่ยง
- [x] revoke all sessions
- [x] clear extension local capture/queue data
- [x] ลบ queue item หาก TASK-503 ถูกทำ

### ขั้นตอน

- [x] confirmation ระบุชื่อ target
- [x] ระบุผลกระทบว่า server-side หรือ local-only
- [x] ระบุว่ากู้คืนได้หรือไม่
- [x] destructive confirm label ต้องเฉพาะเจาะจง เช่น “ลบการประชุม” ไม่ใช้ “ตกลง”
- [x] cancel เป็น safe default
- [x] หลัง confirm ให้มี busy state
- [x] request fail ต้องไม่ปิดหน้า/ออกจากระบบ/ลบ UI แบบสำเร็จ
- [x] แก้ `logout/revokeAll().finally(...)` ให้เปลี่ยน auth stateเฉพาะ success ที่เหมาะสม

### Acceptance criteria

- [x] ไม่มี destructive action สำคัญที่ทำทันทีโดยไม่ยืนยัน
- [x] failure ไม่ถูกแสดงเป็น success

## TASK-304: แยก empty state ของ workspace กับ search no-result

Priority: P1  
Dependencies: TASK-201  
Files: `src/App.tsx`, `src/styles.css`, tests

### ขั้นตอน

- [x] query ว่าง + ไม่มี meetings → onboarding empty state
- [x] query ไม่ว่าง + ไม่มีผล → “ไม่พบการประชุมที่ตรงกับ…”
- [x] แสดง query ปัจจุบันอย่างปลอดภัย
- [x] มีปุ่มล้างตัวกรอง
- [x] sidebar search มี clear control ที่ accessible
- [x] ระหว่าง debounce/load แสดงสถานะที่ไม่ทำให้เข้าใจว่าไม่มีข้อมูล
- [x] เมื่อ clear แล้ว restore list/selection ตามปกติ

### Tests

- [x] initial empty
- [x] filtered empty
- [x] clear search แล้ว meetings กลับมา
- [x] query เปลี่ยนเร็ว response เก่าไม่ทับใหม่

### Acceptance criteria

- [x] ผู้ใช้แยกได้ว่า workspace ว่างหรือแค่ค้นหาไม่พบ

## TASK-305: จัด error lifecycle ของ dashboard

Priority: P1  
Dependencies: TASK-107, TASK-201  
Files: `src/App.tsx`, `src/styles.css`, tests

### ขั้นตอน

- [x] แยก global/bootstrap error จาก meeting/member/action error เท่าที่จำเป็น
- [x] successful retry ล้าง error ที่เกี่ยวข้อง
- [x] error จากหน้าหนึ่งไม่ค้างข้ามไปอีกหน้าโดยไม่มีความเกี่ยวข้อง
- [x] error banner ปิดได้หากไม่ต้อง action ต่อ
- [x] meeting load fail ให้คง meeting เดิมถ้ามี
- [x] pagination error ไม่ลบรายการเดิม
- [x] polling error ไม่ spam banner
- [x] raw backend English ที่แสดงต่อผู้ใช้ควรมี fallback ภาษาไทย โดยยังเก็บ request id หากมี

### Acceptance criteria

- [x] ไม่มี stale error banner ที่ยังอยู่หลัง action สำเร็จ
- [x] failure ไม่ทำให้หน้าหลักว่างโดยไม่จำเป็น

## TASK-306: แยก auth failure ออกจาก server/network failure

Priority: P1  
Dependencies: TASK-305  
Files: `src/lib/api.ts`, `src/App.tsx`, login tests

### ขั้นตอน

- [x] request error เก็บ status/code เท่าที่ response มี โดยไม่ทำ API ใหญ่เกินจำเป็น
- [x] `/me` 401/403 → แสดง login
- [x] `/me` network/5xx → แสดง server unavailable พร้อม retry
- [x] login invalid credentials → error ใกล้ form
- [x] login network/5xx → ข้อความต่างจากรหัสผ่านผิด
- [x] retry bootstrap ได้โดยไม่ reload browser ทั้งหน้า

### Tests

- [x] `/me` 401
- [x] `/me` 500
- [x] `/me` network reject
- [x] login 401 และ login network reject

### Acceptance criteria

- [x] server ล่มไม่ถูกตีความว่า session หมดอายุเสมอ

## TASK-307: ทำ health state ให้ refresh และอธิบายได้

Priority: P1  
Dependencies: TASK-306  
Files: `src/App.tsx`, `src/types.ts` หากจำเป็น, `src/styles.css`, tests

### States

- [x] checking
- [x] ready
- [x] server unreachable
- [x] database not ready
- [x] Ollama disconnected
- [x] model unavailable

### ขั้นตอน

- [x] initial UI แสดง “กำลังตรวจสอบ” ไม่ใช่ offline ทันที
- [x] retry แบบ manual หรือ interval ที่ไม่ถี่เกินไป
- [x] หยุด timer เมื่อ unmount
- [x] viewer เห็นเฉพาะ operational message ที่จำเป็น
- [x] owner/admin เห็น dependency detail ใน settings
- [x] ใช้ status color/copy สม่ำเสมอ

### Acceptance criteria

- [x] health ไม่ stale ตลอด session หลัง initial failure
- [x] ข้อความบอกสาเหตุได้เท่าที่ response อนุญาต

## TASK-308: Reset state เมื่อเปลี่ยน workspace

Priority: P1  
Dependencies: TASK-201, TASK-301, TASK-305  
Files: `src/App.tsx`, tests

### State ที่ต้องพิจารณา

- [x] selected workspace
- [x] meeting และ meeting list
- [x] next cursor
- [x] meeting search
- [x] selected/expanded topic
- [x] mobile tab
- [x] view: meetings/members/settings
- [x] member list
- [x] loading/error state
- [x] pending requests/polling

### ขั้นตอน

- [x] เปลี่ยน workspace แล้วห้ามแสดง meeting/member จาก workspace เก่าระหว่างโหลด
- [x] ยกเลิก/ignore stale requests
- [x] หาก role ใหม่ไม่มี member permission ให้กลับ meetings หรือ settings ที่ valid
- [x] nav active ต้องตรงหน้าที่แสดง
- [x] กำหนดชัดว่าจะ reset search และ mobile tab หรือ preserve; ค่าแนะนำคือ reset เพื่อไม่พก context ข้าม workspace
- [x] polling workspace เก่าต้องหยุดทันที

### Tests

- [x] owner workspace → viewer workspace
- [x] viewer workspace → owner workspace
- [x] workspace ใหม่ไม่มี meetings
- [x] เปลี่ยน workspace ระหว่าง meeting/pagination request
- [x] เปลี่ยน workspace ขณะอยู่ members view

### Acceptance criteria

- [x] ไม่มีข้อมูลหรือ permission UI ของ workspace เก่ารั่วมาหน้าใหม่

---

# Phase 4 — P2: Consistency, polish และ accessibility

## TASK-401: ทำ terminology mapping ให้สม่ำเสมอ

Priority: P2  
Dependencies: P1 เสร็จ  
Files: `src/i18n/th.ts`, components, `extension/popup.html`, `extension/popup.js`, `extension/content.js`

### คำที่ต้องตัดสินใจและใช้ให้เหมือนกัน

- [x] Workspace หรือ พื้นที่ทำงาน
- [x] บันทึกคำบรรยาย แทนการสลับ จับ/บันทึก/capture
- [x] เซิร์ฟเวอร์ หรือ Server
- [x] แดชบอร์ด
- [x] role labels ภาษาไทย:
  - [ ] owner
  - [ ] admin
  - [ ] member
  - [ ] viewer
- [x] queue states:
  - [ ] รอส่ง
  - [ ] กำลังส่ง
  - [ ] ส่งไม่สำเร็จ
  - [ ] ส่งสำเร็จ

### ขั้นตอน

- [x] ทำ inventory ของข้อความที่ผู้ใช้มองเห็นด้วย `rg`
- [x] เปลี่ยนเฉพาะ visible copy ไม่เปลี่ยน enum/API keys
- [x] dashboard และ extension ใช้คำชุดเดียวกัน
- [x] capitalization และ punctuation ไทยสม่ำเสมอ
- [x] หลีกเลี่ยงข้อความเทคนิค เช่น Dependency ใน surface ผู้ใช้ทั่วไป

### Acceptance criteria

- [x] ไม่มีหน้าหนึ่งใช้ “จับ” แต่อีกหน้าใช้ “บันทึก” กับ action เดียวกันโดยไม่มีเหตุผล
- [x] role ภาษาอังกฤษไม่หลุดใน UI ไทย

## TASK-402: ทำ visual state ให้สอดคล้องกัน

Priority: P2  
Dependencies: TASK-401  
Files: `src/styles.css`, `extension/popup.css`, markup เล็กน้อย

### ขั้นตอน

- [x] success ใช้ green family เดียวกัน
- [x] danger ใช้ red family เดียวกัน
- [x] warning/pending แยกจาก offline/error
- [x] border radius, border, focus ring และ disabled opacity ใกล้เคียงกัน
- [x] status ไม่อาศัยสีอย่างเดียว ต้องมี text/icon
- [x] brand mark ของ extension สอดคล้องกับ web โดย reuse SVG/path ถ้าทำได้ด้วย diff เล็ก
- [x] reduced motion ยังครอบ transition/spinner ที่เพิ่ม

### Acceptance criteria

- [x] action/state เดียวกันมี visual meaning เดียวกันทั้งสอง surfaces

## TASK-403: ปรับ meeting header และ long-content behavior

Priority: P2  
Dependencies: TASK-206  
Files: `src/components/MeetingHeader.tsx`, `src/components/SpeakerBars.tsx`, `src/components/Transcript.tsx`, `src/styles.css`

### ขั้นตอน

- [x] ชื่อ meeting ยาว wrap โดยไม่เบียด action จนใช้ไม่ได้
- [x] desktop header actions คงขนาดที่เหมาะสม
- [x] mobile แสดง analysis status และจำนวนผู้พูดในลำดับที่อ่านง่าย
- [x] speaker name ยาวไม่ทำ bar/filter/transcript text column แคบเกิน
- [x] filter chips wrap หรือ scroll อย่างตั้งใจ
- [x] tooltip/title ใช้เฉพาะเมื่อข้อความถูก truncate จริง
- [x] ตรวจข้อความไทย/อังกฤษ/อีเมลยาว

### Acceptance criteria

- [x] long title/speaker ไม่สร้าง horizontal overflow
- [x] primary action ยังเห็นและกดได้ทุก viewport

## TASK-404: ปรับ Members และ Settings ให้เป็น design system เดียวกับ dashboard

Priority: P2  
Dependencies: TASK-302, TASK-307  
Files: `src/App.tsx`, `src/styles.css`

### ขั้นตอน

- [x] เพิ่ม description สั้นใต้ heading
- [x] ใช้ panel/card spacing และ heading hierarchy เดียวกับ meeting panels
- [x] health dependencies แสดงเป็น status rows/cards ไม่ใช่ข้อความ `dl` ดิบ
- [x] danger zone แยกจากข้อมูลบัญชีทั่วไป
- [x] revoke sessions อธิบายผลกระทบ
- [x] responsive ที่ 320/390px

### Acceptance criteria

- [x] Members/Settings ไม่ดูเป็นหน้าคนละระบบ

## TASK-405: ทำ mobile tabs ให้ accessible

Priority: P2  
Dependencies: TASK-204, TASK-205  
Files: `src/App.tsx`, component tests

### ขั้นตอน

- [x] tab ทุกตัวมี stable `id`
- [x] tab มี `aria-controls`
- [x] content มี `role="tabpanel"`
- [x] panel มี `aria-labelledby`
- [x] active tab `tabIndex=0`; inactive `tabIndex=-1`
- [x] ArrowLeft/ArrowRight เปลี่ยน tab และ focus
- [x] Home/End ไป tab แรก/สุดท้าย
- [x] desktop ที่แสดงทุก panel ไม่ควรมี tab semantics ที่ทำให้เข้าใจผิด
- [x] เมื่อเปลี่ยน meeting ให้ tab behavior คงที่ตาม decision ใน TASK-308

### Tests

- [x] click/touch
- [x] ArrowLeft/ArrowRight
- [x] Home/End
- [x] screen-reader attributes เชื่อม tab-panel ถูกต้อง

### Acceptance criteria

- [x] ผ่าน WAI-ARIA tab interaction ขั้นพื้นฐาน

## TASK-406: เพิ่ม accessibility ให้ filters, topics และ async feedback

Priority: P2  
Dependencies: TASK-205, TASK-302  
Files: components ที่เกี่ยวข้อง

### ขั้นตอน

- [x] speaker filter มี `aria-pressed` หรือ semantics ที่เหมาะสม
- [x] topic expanded state มี attributes ครบ
- [x] icon-only delete มี accessible name และ visible tooltip/context
- [x] async success/error ใช้ `role=status` หรือ `aria-live` อย่างเหมาะสม
- [x] polling ไม่ประกาศซ้ำทุก interval
- [x] focus ไป heading/content หลัง navigation เมื่อเหมาะสม
- [x] touch targets อย่างน้อย 44px บน mobile
- [x] ตรวจ focus-visible ทุก interactive control
- [x] contrast ของ muted text, status chips และ disabled control พออ่านได้

### Acceptance criteria

- [x] keyboard-only flow หลักทำได้ครบ
- [x] ไม่มี control สำคัญที่มีแค่สีหรือ icon โดยไม่มีชื่อ

---

# Phase 5 — Optional low-risk completion features

ทำ phase นี้หลัง P0/P1 ผ่านเท่านั้น แต่ละ task ทำแยกได้และต้องไม่เปลี่ยน backend

## TASK-501: เพิ่ม copy actions

Priority: P2 Optional  
Dependencies: TASK-204

- [x] copy summary
- [x] copy decisions/action items
- [x] copy transcript
- [x] มี “คัดลอกแล้ว” และ error feedback
- [x] preserve speaker/time formatting ที่อ่านได้
- [x] fallback เมื่อ Clipboard API ใช้ไม่ได้

## TASK-502: แสดง analysis metadata

Priority: P2 Optional  
Dependencies: TASK-206

- [x] model
- [x] analyzed time
- [x] meeting source
- [x] metadata ไม่แย่ง summary/action
- [x] ไม่แสดง label ว่างเมื่อค่า null

## TASK-503: เพิ่ม queue item removal

Priority: P2 Optional  
Dependencies: TASK-103, TASK-303

- [x] ลบ failed/queued item รายรายการได้
- [x] uploading item ห้ามลบกลาง request หรือกำหนด behavior ชัดเจน
- [x] confirm พร้อมชื่อ meeting และคำเตือนว่าข้อมูล local จะหาย
- [x] ไม่กระทบ auth/server config
- [x] queue summary/capacity update ทันที

## TASK-504: เพิ่ม capture elapsed time และ prerequisite copy

Priority: P2 Optional  
Dependencies: TASK-105, TASK-106

- [x] แสดงเวลาที่บันทึกมาแล้วใน popup
- [x] บอกให้เปิด Google Meet และ captions ก่อนเริ่ม
- [x] ถ้า active tab ไม่ใช่ Meet ให้ disable/อธิบายก่อนกดแทนรอ error หลังคลิก
- [x] timer หยุดและ cleanup เมื่อ popup ปิด

## TASK-505: ลดการรบกวนของ in-page indicator

Priority: P2 Optional  
Dependencies: TASK-105

- [x] ไม่แสดง “Meetwise หยุดแล้ว” ค้างตลอดหน้า Meet
- [x] แสดงเมื่อ capturing/sending/error หรือช่วงสั้นหลัง status change
- [x] ถ้า error ค้าง ให้ dismiss ได้
- [x] ไม่บัง Meet controls ที่พบบ่อย
- [x] pointer/focus behavior ไม่รบกวน keyboard navigation

## TASK-506: ทำ onboarding empty meeting state

Priority: P2 Optional  
Dependencies: TASK-304

- [x] ขั้นตอน 1 เปิด/ติดตั้ง extension
- [x] ขั้นตอน 2 เปิด Google Meet captions
- [x] ขั้นตอน 3 เริ่มบันทึก
- [x] ขั้นตอน 4 หยุดและส่ง
- [x] ไม่อ้างว่า extension เชื่อมต่ออยู่หาก web ตรวจไม่ได้

---

# Phase 6 — Final QA

## TASK-601: รัน automated checks ทั้งหมด

Priority: Required  
Dependencies: tasks ที่เลือกทำเสร็จทั้งหมด

- [x] `npm run lint`
- [x] `npm run typecheck`
- [x] `npm test`
- [x] `npm run build`
- [x] รัน extension unit tests ที่เพิ่ม
- [x] รัน component tests ที่เพิ่ม
- [x] ตรวจว่าไม่ได้เผลอรัน integration/DB tests
- [x] ตรวจ `git diff --check`
- [x] ตรวจ `git status --short` และแยกไฟล์ผู้ใช้เดิมกับไฟล์ที่งานนี้แก้

### Acceptance criteria

- [x] ทุก command ผ่าน
- [x] ไม่มี snapshot/test ที่ผ่านเพราะ assertion อ่อน เช่น count `< 0`
- [x] ไม่มี skipped test ที่ครอบ regression สำคัญ

## TASK-602: Browser QA ด้วย mock API

Priority: Required  
Dependencies: TASK-601

### Environment

- [x] Desktop 1440×960
- [x] Laptop/tablet 1024px
- [x] Breakpoint 760px
- [x] Mobile 390×844
- [x] Small mobile 320px
- [x] `prefers-reduced-motion: reduce`

### Page checks

- [x] URL/title ถูกต้อง
- [x] meaningful content render ไม่ blank
- [x] ไม่มี Vite/React overlay
- [x] ไม่มี relevant console error/warning
- [x] ไม่มี horizontal overflow
- [x] long Thai text, English text, email และ long speaker name ไม่พัง layout

### Dashboard flows

- [x] `/me` 401 → login
- [x] `/me` network/500 → server error + retry
- [x] login success/error/double click
- [x] meeting initial load
- [x] meeting navigation fail โดย meeting เดิมยังอยู่
- [x] search result, no result และ clear
- [x] pagination success/fail/retry/reset
- [x] transcript text search
- [x] speaker filter
- [x] analysis none/pending/running/completed/failed
- [x] polling ไม่กระพริบและไม่เปลี่ยน scroll
- [x] summary/decisions/action items
- [x] topic expand/contributions
- [x] workspace owner → viewer → owner
- [x] members loading/add/update/delete/error
- [x] destructive cancel/confirm/failure
- [x] settings/health states

### Mobile flows

- [x] drawer open/close/scrim/Escape/focus return
- [x] navigation แล้ว drawer ปิด
- [x] tabs click + keyboard
- [x] MemberAdmin ไม่มี overflow
- [x] long title และ header actions ใช้งานได้
- [x] status ผู้วิเคราะห์ยังเห็น

### Extension flows

- [x] unauthenticated login view
- [x] authenticated capture-ready view
- [x] active tab ไม่ใช่ Meet
- [x] start capture
- [x] stop/send success
- [x] stop/send runtime rejection
- [x] multiple queued items drain
- [x] failed item retry
- [x] uploaded history retention
- [x] clear local data cancel/confirm
- [x] settings save success/fail/managed URL
- [x] logout success/fail

### Acceptance criteria

- [x] ทุก flow มี DOM/state assertion หลัง interaction ไม่ใช่ screenshot อย่างเดียว
- [x] เก็บ screenshot เฉพาะ state สำคัญโดยไม่ commit artifact ถ้าผู้ใช้ไม่ได้ขอ

## TASK-603: Regression audit รอบสุดท้าย

Priority: Required  
Dependencies: TASK-602

- [x] เทียบ behavior กับ `audit.md` ทีละข้อ
- [x] ตรวจว่า P0 ทุกข้อมี test
- [x] ตรวจว่า API values/enums ไม่ถูกแปลจน backend ใช้ไม่ได้
- [x] ตรวจว่า CSRF/auth/idempotency headers ยังอยู่
- [x] ตรวจว่า extension checkpoint/restore ยังทำงาน
- [x] ตรวจว่า role-based UI ไม่กว้างกว่า backend permission
- [x] ตรวจว่าไม่มี database/migration/schema change โดยไม่จำเป็น
- [x] ตรวจว่าไม่มี unrelated refactor/format churn
- [x] ตรวจว่าไฟล์ dirty เดิมของผู้ใช้ไม่ถูกย้อน

## TASK-604: สรุปส่งมอบ

Priority: Required  
Dependencies: TASK-603

Final response ต้องมี:

- [x] สรุปผลลัพธ์ที่ผู้ใช้เห็น
- [x] รายการ TASK ที่เสร็จ
- [x] TASK ที่ไม่ทำ พร้อมเหตุผลและผลกระทบ
- [x] ไฟล์หลักที่แก้
- [x] ผล lint/typecheck/test/build
- [x] viewport และ interaction ที่ทดสอบจริง
- [x] console/accessibility/responsive status
- [x] remaining risks เช่น Google Meet DOM จริง, browser version หรือ state ที่ mock ไม่ครอบคลุม

---

# Suggested execution order

ใช้ลำดับนี้เพื่อลดการแก้ซ้ำ:

1. [ ] TASK-001 → TASK-002
2. [ ] TASK-101 → TASK-102 → TASK-103
3. [ ] TASK-104 → TASK-105 → TASK-106
4. [ ] TASK-107
5. [ ] TASK-201 → TASK-304
6. [ ] TASK-202 → TASK-203
7. [ ] TASK-204 → TASK-205 → TASK-206 → TASK-207
8. [ ] TASK-301 → TASK-302 → TASK-303
9. [ ] TASK-305 → TASK-306 → TASK-307 → TASK-308
10. [ ] TASK-401 → TASK-402 → TASK-403 → TASK-404
11. [ ] TASK-405 → TASK-406
12. [ ] เลือก TASK-501 ถึง TASK-506 ตามเวลาหลัง P0/P1 ผ่าน
13. [ ] TASK-601 → TASK-602 → TASK-603 → TASK-604

## Milestone checkpoints

### Milestone A — Data safety

- [x] TASK-101 ถึง TASK-106 ผ่าน
- [x] multi-item queue ไม่ค้าง
- [x] repeated utterance ไม่หาย
- [x] stop/send failure recover ได้

### Milestone B — Dashboard correctness

- [x] TASK-107 และ TASK-201 ถึง TASK-207 ผ่าน
- [x] polling ไม่กระพริบ
- [x] pagination ใช้งานได้
- [x] analysis แสดงครบ
- [x] mobile ไม่มี overflow

### Milestone C — Operational UX

- [x] TASK-301 ถึง TASK-308 ผ่าน
- [x] permission/destructive/error/health/workspace state ถูกต้อง

### Milestone D — Product consistency

- [x] TASK-401 ถึง TASK-406 ที่เลือกทำผ่าน
- [x] terminology, visual state และ accessibility สอดคล้องกัน

### Milestone E — Release readiness

- [x] TASK-601 ถึง TASK-604 ผ่าน
- [x] ไม่มี known P0/P1 regression ที่ยังไม่ถูกระบุ
