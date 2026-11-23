/* HaSlik POS – page script (stage 1: 1:1 port of the legacy Index.html script).
   Talks to the server only through api(action, payload, clientTxId) → google.script.run.api(...).
   Contract: src/shared/api.ts · docs/API.md. Money from the server is in agorot. */
(function(){
  'use strict';
  var PIN_KEY = 'hasalik_pin';
  var S = { pin:'', data:null, sel:null, guest:false, type:null, qty:1, reqId:null, busy:false, exReqId:null };
  var $ = function(id){ return document.getElementById(id); };

  /* ---------- server ---------- */
  function uid(){ return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,10); }
  /** google.script.run can hang (tablet asleep, weak Wi-Fi), so every call gets a timeout.
      A write that times out is retried by the user with the same clientTxId, so it can't be recorded twice. */
  function api(action, payload, txId, timeoutMs){
    return new Promise(function(res, rej){
      var done = false;
      var timer = setTimeout(function(){
        if (done) return; done = true;
        var e = new Error('השרת לא ענה בזמן – בדוק את החיבור ונסה שוב'); e.code = 'TIMEOUT'; rej(e);
      }, timeoutMs || 30000);
      function finish(fn, v){ if (done) return; done = true; clearTimeout(timer); fn(v); }
      google.script.run
        .withSuccessHandler(function(r){
          if (r && r.ok) return finish(res, r.data);
          var e = new Error((r && r.error && r.error.message) || 'שגיאה לא ידועה');
          e.code = r && r.error && r.error.code;
          finish(rej, e);
        })
        .withFailureHandler(function(e){ finish(rej, e && e.message ? e : new Error(String(e))); })
        .api({ action: action, payload: payload, auth: { pin: S.pin }, clientTxId: txId || uid() });
    });
  }

  /* ---------- utils ---------- */
  function esc(s){ return String(s==null?'':s).replace(/[&<>"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c];}); }
  function money(agorot){ // whole shekels as before; agorot shown only when there are any (₪123.50)
    var a = Math.round(Number(agorot)||0);
    return '₪' + (a/100).toLocaleString('en-US', { minimumFractionDigits: a % 100 ? 2 : 0, maximumFractionDigits: 2 });
  }
  function norm(s){ return String(s||'').replace(/[֑-ׇ]/g,'').replace(/['"`׳״\-.]/g,'').replace(/\s+/g,' ').trim().toLowerCase(); }
  function store(k,v){ try{ if(v==null) localStorage.removeItem(k); else localStorage.setItem(k,v);}catch(e){} }
  function load(k){ try{ return localStorage.getItem(k)||''; }catch(e){ return ''; } }
  var toastT;
  function toast(msg, kind){
    var t=$('toast'); t.textContent=msg; t.className='toast '+(kind||'ok');
    clearTimeout(toastT); toastT=setTimeout(function(){ t.className='toast hidden'; }, kind==='bad'?4500:2600);
  }
  function errMsg(e){ var m=(e&&e.message)||String(e); return m.replace(/^Exception:\s*/,''); }
  function show(view){
    ['vLoading','vPin','vSell','vTodo','vExp'].forEach(function(v){ $(v).classList.toggle('hidden', v!==view); });
    $('hdr').classList.toggle('hidden', view==='vLoading'||view==='vPin');
  }

  /* ---------- init / pin ---------- */
  /* Fast start: the last successful load is kept on the device and shown immediately,
     then replaced by fresh data from the server. Every write still goes to the server. */
  var CACHE_KEY = 'hasalik_init';
  function saveCache(d){
    store(CACHE_KEY, JSON.stringify({ role:d.role, pubName:d.pubName, period:d.period, cardTypes:d.cardTypes,
      members:d.members, shift:d.shift, todos:d.todos, reportUrl:d.reportUrl }));
  }
  function loadCache(){ try { return JSON.parse(load(CACHE_KEY) || 'null'); } catch(e){ return null; } }
  function shiftDay(){ // same rule as the server: before 08:00 belongs to the previous evening
    var d = new Date(Date.now() - 8*3600*1000); d.setMinutes(d.getMinutes()-d.getTimezoneOffset());
    return d.toISOString().slice(0,10);
  }

  function apply(d){
    var first = !S.data;
    S.data = d;
    var isAdmin = d.role === 'admin';
    $('pubName').textContent = d.pubName;
    $('periodTitle').textContent = d.period.title;
    $('tabExp').classList.toggle('hidden', !isAdmin);
    var sh = d.shift && d.shift.date === shiftDay() ? d.shift : { date: shiftDay(), cards: 0, amountAgorot: 0, recent: [] };
    renderShift(sh);
    if (!S.editing){ S.todos = d.todos || []; renderTodos(); }
    if (isAdmin && d.expenses) renderExpenses(d.expenses);
    if (isAdmin) $('reportLink').href = d.reportUrl || '#';
    if ($('q').value) renderResults();
    if (first){ show('vSell'); setTab('sell'); }
  }

  var loadTimer = null;
  function loadingSlow(on){
    clearTimeout(loadTimer);
    $('loadMsg').textContent = on ? 'לוקח יותר זמן מהרגיל…' : 'רגע, מוזגים…';
    $('loadRetry').classList.toggle('hidden', !on);
    if (!on) loadTimer = setTimeout(function(){ loadingSlow(true); }, 8000);
  }
  $('loadRetry').onclick = function(){ loadingSlow(false); load_(1); };

  function init(){
    var cached = loadCache();
    if (cached && !S.data) apply(cached);
    else if (!S.data){ show('vLoading'); loadingSlow(false); }
    load_(1);
  }
  function load_(attempt){
    api('session.init', null, null, 25000).then(function(d){
      clearTimeout(loadTimer);
      apply(d); saveCache(d);
    }).catch(function(e){
      if (e.code === 'PIN_REQUIRED'){
        clearTimeout(loadTimer);
        store(CACHE_KEY, null); S.data = null;
        if (S.pin){ toast(errMsg(e),'bad'); store(PIN_KEY,null); S.pin=''; }
        show('vPin'); setTimeout(function(){ $('pinInput').focus(); },50);
      } else if (attempt < 3 && e.code !== 'RATE_LIMITED' && e.code !== 'NOT_CONFIGURED'){
        setTimeout(function(){ load_(attempt + 1); }, 1500 * attempt); // automatic retry
      } else if (S.data){
        toast('אין חיבור לשרת – מוצגים הנתונים האחרונים. ' + errMsg(e), 'bad');
      } else {
        clearTimeout(loadTimer);
        $('loadMsg').textContent = errMsg(e);
        $('loadRetry').classList.remove('hidden');
      }
    });
  }
  $('pinBtn').onclick = function(){ S.pin = $('pinInput').value.trim(); store(PIN_KEY,S.pin); $('pinInput').value=''; init(); };
  $('pinInput').onkeydown = function(e){ if(e.key==='Enter') $('pinBtn').click(); };

  /* ---------- tabs ---------- */
  function setTab(v){
    Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(b){ b.classList.toggle('on', b.dataset.view===v); });
    S.tab = v;
    show({ sell:'vSell', todo:'vTodo', exp:'vExp' }[v] || 'vSell');
    if (v==='exp' && !$('exDate').value) $('exDate').value = todayISO();
    if (v==='todo') refreshTodos();
  }
  Array.prototype.forEach.call(document.querySelectorAll('.tab'), function(b){ b.onclick=function(){ setTab(b.dataset.view); }; });

  /* ---------- search ---------- */
  function renderResults(){
    var q = norm($('q').value), out=$('results'), hint=$('searchHint');
    if (q.length < 2){ out.innerHTML=''; hint.classList.remove('hidden'); hint.textContent='הקלד 2 אותיות לפחות משם פרטי או משפחה'; return; }
    var tokens = q.split(' ');
    var hits = S.data.members.filter(function(m){
      var full = norm(m.first+' '+m.last);
      return tokens.every(function(t){ return full.indexOf(t)>=0; });
    }).slice(0,40);
    if (!hits.length){ out.innerHTML=''; hint.classList.remove('hidden'); hint.textContent='לא נמצא – אפשר לרשום ידנית למטה'; return; }
    hint.classList.add('hidden');
    out.innerHTML = hits.map(function(m){
      return '<li class="member" data-id="'+esc(m.id)+'"><span class="nm">'+esc(m.first)+' '+esc(m.last)+'</span><span class="chev">‹</span></li>';
    }).join('');
  }
  $('q').oninput = renderResults;
  $('results').onclick = function(e){
    var li = e.target.closest('.member'); if(!li) return;
    var m = S.data.members.find(function(x){ return x.id===li.dataset.id; });
    if (m) openSheet(m);
  };
  $('refreshMembers').onclick = function(){
    var b=this; b.disabled=true;
    api('members.list').then(function(list){ S.data.members=list; renderResults(); toast('הרשימה עודכנה ('+list.length+')'); })
      .catch(function(e){ toast(errMsg(e),'bad'); }).then(function(){ b.disabled=false; });
  };
  $('guestBtn').onclick = function(){ openSheet(null); };

  /* ---------- sell sheet ---------- */
  function openSheet(m){
    S.sel=m; S.guest=!m; S.qty=1; S.reqId=uid();
    var types=S.data.cardTypes;
    S.type = types.length ? types[0].name : null;
    $('guestFields').classList.toggle('hidden', !S.guest);
    $('memberHead').classList.toggle('hidden', S.guest);
    if (m) $('selName').textContent = m.first+' '+m.last;
    $('gFirst').value=''; $('gLast').value=''; $('note').value='';
    $('typeBlock').classList.toggle('hidden', !types.length);
    renderSheet();
    $('sellSheet').classList.remove('hidden');
    if (S.guest) setTimeout(function(){ $('gFirst').focus(); },60);
  }
  function closeSheet(){ $('sellSheet').classList.add('hidden'); S.sel=null; }
  function currentType(){ return S.data.cardTypes.find(function(t){ return t.name===S.type; }); }
  function renderSheet(){
    $('typeChips').innerHTML = S.data.cardTypes.map(function(t){
      var shekels = t.priceAgorot / 100;
      var n = shekels % 5 === 0 && shekels <= 150 ? shekels / 5 : 0; // one punch = ₪5, as on the printed card
      return '<button class="chip'+(t.name===S.type?' on':'')+'" data-t="'+esc(t.name)+'"><span class="cn">'+esc(t.name)+'</span><span class="cn" style="font-size:20px">'+money(t.priceAgorot)+'</span>'+(n?'<span style="font-size:12px;opacity:.75">'+n+' ניקובים</span>':'')+'</button>';
    }).join('');
    $('qty').textContent = S.qty;
    var t=currentType();
    $('confirmBtn').textContent = t ? ('אישור · '+money(S.qty*t.priceAgorot)) : 'אין סוגי כרטיסיות פעילים';
    $('confirmBtn').disabled = !t || S.busy;
  }
  $('typeChips').onclick = function(e){ var c=e.target.closest('.chip'); if(!c) return; S.type=c.dataset.t; S.reqId=uid(); renderSheet(); };
  $('qMinus').onclick = function(){ if(S.qty>1){ S.qty--; S.reqId=uid(); renderSheet(); } };
  $('qPlus').onclick = function(){ if(S.qty<20){ S.qty++; S.reqId=uid(); renderSheet(); } };
  $('cancelBtn').onclick = closeSheet;
  $('sellSheet').onclick = function(e){ if(e.target===this) closeSheet(); };
  $('confirmBtn').onclick = function(){
    if (S.busy) return;
    var payload = { cardType:S.type, qty:S.qty, note:$('note').value };
    var label;
    if (S.guest){
      var g = { first:$('gFirst').value.trim(), last:$('gLast').value.trim() };
      if(!g.first && !g.last){ toast('יש להזין שם','bad'); return; }
      payload.guest = g; label=(g.first+' '+g.last).trim();
    } else { payload.memberId=S.sel.id; label=S.sel.first+' '+S.sel.last; }
    S.busy=true; $('confirmBtn').disabled=true; $('confirmBtn').textContent='שומר…';
    api('sale.create', payload, S.reqId).then(function(shift){
      renderShift(shift); closeSheet();
      toast('✓ '+label+' – '+payload.qty+' כרטיסיות');
      $('q').value=''; renderResults(); $('q').focus();
    }).catch(function(e){
      // same clientTxId is kept – tapping again can't record twice
      toast('לא נשמר: '+errMsg(e)+' – נסה שוב','bad');
    }).then(function(){ S.busy=false; if(!$('sellSheet').classList.contains('hidden')) renderSheet(); });
  };

  /* ---------- shift / recent ---------- */
  function renderShift(sh){
    $('stTickets').textContent = sh.cards;
    $('stAmount').textContent = money(sh.amountAgorot);
    $('recent').innerHTML = sh.recent.length ? sh.recent.map(function(r){
      return '<div class="row'+(r.voided?' void':'')+'"><div class="main">'+
        '<div class="t">'+esc(r.name)+(r.inList?'':'<span class="tag">לא ברשימה</span>')+'</div>'+
        '<div class="s">'+esc(r.time)+' · '+r.qty+' × '+esc(r.cardType)+(r.note?' · '+esc(r.note):'')+(r.voided?' · בוטל':'')+'</div></div>'+
        '<span class="amt">'+money(r.totalAgorot)+'</span>'+
        (r.canUndo?'<button class="undo" data-id="'+esc(r.id)+'">ביטול</button>':'')+'</div>';
    }).join('') : '<div class="hint">עוד אין רישומים במשמרת</div>';
  }
  function twoTap(btn, fn){
    if (!btn.classList.contains('sure')){
      btn.classList.add('sure'); var old=btn.textContent; btn.textContent='בטוח?';
      setTimeout(function(){ if(btn.isConnected){ btn.classList.remove('sure'); btn.textContent=old; } },3000);
      return;
    }
    btn.disabled=true; fn();
  }
  $('recent').onclick = function(e){
    var b=e.target.closest('.undo'); if(!b) return;
    twoTap(b, function(){
      api('sale.void', { saleId: b.dataset.id }).then(function(sh){ renderShift(sh); toast('הרישום בוטל','warn'); })
        .catch(function(err){ b.disabled=false; toast(errMsg(err),'bad'); });
    });
  };

  /* ---------- expenses (admin) ---------- */
  function todayISO(){ var d=new Date(); d.setMinutes(d.getMinutes()-d.getTimezoneOffset()); return d.toISOString().slice(0,10); }
  S.exType = 'EXPENSE'; S.exEdit = null; S.exItems = [];
  function renderExpenses(st){
    S.exItems = st.items;
    $('exListTitle').textContent = 'הוצאות ' + st.periodTitle;
    $('exTotal').textContent = money(st.netAgorot);
    $('exSums').classList.toggle('hidden', !st.creditsAgorot);
    $('exSums').innerHTML = '<span>הוצאות '+money(st.expensesAgorot)+'</span><span>זיכויים '+money(st.creditsAgorot)+'</span>';
    $('exList').innerHTML = st.items.length ? st.items.map(function(x){
      var credit = x.type === 'CREDIT';
      return '<div class="row'+(credit?' credit':'')+'"><div class="main"><div class="t">'+esc(x.desc)+(credit?'<span class="tag">זיכוי</span>':'')+'</div><div class="s">'+esc(x.date)+'</div></div>'+
        '<span class="amt"'+(credit?' dir="ltr">−':'>')+money(x.amountAgorot)+'</span>'+
        '<button class="mini" data-act="edit" data-id="'+esc(x.id)+'" aria-label="עריכה">✎</button>'+
        '<button class="undo" data-id="'+esc(x.id)+'">ביטול</button></div>';
    }).join('') : '<div class="hint">אין הוצאות החודש</div>';
  }
  function setExType(t){
    S.exType = t === 'CREDIT' ? 'CREDIT' : 'EXPENSE';
    Array.prototype.forEach.call($('exType').querySelectorAll('.chip'), function(c){ c.classList.toggle('on', c.dataset.type===S.exType); });
  }
  function exSaveLabel(){ return S.exEdit ? 'עדכון' : (S.exType==='CREDIT' ? 'שמירת זיכוי' : 'שמירת הוצאה'); }
  function resetExForm(){
    S.exEdit = null; S.exReqId = null;
    $('exDesc').value=''; $('exAmount').value=''; $('exDate').value=todayISO(); setExType('EXPENSE');
    $('exFormTitle').textContent = 'הוצאה חדשה'; $('exCancelEdit').classList.add('hidden'); $('exForm').classList.remove('editing');
    $('exSave').textContent = exSaveLabel();
  }
  function startExEdit(x){
    S.exEdit = x.id; S.exReqId = null;
    $('exDesc').value = x.desc; $('exAmount').value = x.amountAgorot/100; $('exDate').value = x.dateIso || todayISO();
    setExType(x.type);
    $('exFormTitle').textContent = 'עריכת שורה'; $('exCancelEdit').classList.remove('hidden'); $('exForm').classList.add('editing');
    $('exSave').textContent = exSaveLabel();
    $('exForm').scrollIntoView({ behavior:'smooth', block:'start' });
  }
  $('exType').onclick = function(e){
    var c = e.target.closest('.chip'); if(!c) return;
    setExType(c.dataset.type); S.exReqId=null; $('exSave').textContent = exSaveLabel();
  };
  $('exCancelEdit').onclick = resetExForm;
  $('exSave').onclick = function(){
    var b=this, desc=$('exDesc').value.trim(), amount=Number($('exAmount').value), date=$('exDate').value;
    if(!desc){ toast('יש להזין פירוט','bad'); return; }
    if(!(amount>0)){ toast('יש להזין סכום','bad'); return; }
    var payload = { desc:desc, amountAgorot:Math.round(amount*100), date:date, type:S.exType };
    var editing = !!S.exEdit, credit = S.exType === 'CREDIT';
    if (editing) payload.expenseId = S.exEdit;
    S.exReqId = S.exReqId || uid();
    b.disabled=true; b.textContent='שומר…';
    api(editing ? 'expense.update' : 'expense.create', payload, S.exReqId).then(function(st){
      renderExpenses(st); resetExForm();
      if (st.warning) toast(st.warning,'warn');
      else toast(editing ? '✓ עודכן' : (credit ? '✓ הזיכוי נשמר' : '✓ ההוצאה נשמרה'));
    }).catch(function(e){ toast('לא נשמר: '+errMsg(e),'bad'); })
      .then(function(){ b.disabled=false; b.textContent=exSaveLabel(); });
  };
  ['exDesc','exAmount','exDate'].forEach(function(id){ $(id).addEventListener('input', function(){ S.exReqId=null; }); });
  $('exList').onclick = function(e){
    var ed = e.target.closest('[data-act="edit"]');
    if (ed){ var x = S.exItems.find(function(i){ return i.id===ed.dataset.id; }); if (x) startExEdit(x); return; }
    var b=e.target.closest('.undo'); if(!b) return;
    twoTap(b, function(){
      api('expense.void', { expenseId: b.dataset.id }).then(function(st){
        if (S.exEdit === b.dataset.id) resetExForm();
        renderExpenses(st); toast('השורה בוטלה','warn');
      }).catch(function(err){ b.disabled=false; toast(errMsg(err),'bad'); });
    });
  };
  $('reportRefresh').onclick = function(){
    var b=this; b.disabled=true; b.textContent='מעדכן…';
    api('report.refresh').then(function(r){ $('reportLink').href=r.url; toast('הדוח עודכן'); })
      .catch(function(e){ toast(errMsg(e),'bad'); }).then(function(){ b.disabled=false; b.textContent='↻ עדכון הדוח עכשיו'; });
  };

  /* ---------- shortages (חוסרים) ---------- */
  function todoRow(x){
    if (S.editing===x.id){
      return '<div class="row todo" data-id="'+esc(x.id)+'"><div class="main"><input class="editin" id="tdEdit" maxlength="120" value="'+esc(x.text)+'"></div>'+
        '<button class="mini" data-act="save">שמירה</button><button class="mini" data-act="cancel">ביטול</button></div>';
    }
    return '<div class="row todo'+(x.done?' done':'')+'" data-id="'+esc(x.id)+'">'+
      '<button class="tick" data-act="tick" aria-label="'+(x.done?'החזר לחסר':'סמן שנקנה')+'">'+(x.done?'✓':'')+'</button>'+
      '<div class="main"><div class="t">'+esc(x.text)+'</div><div class="s">נוסף '+esc(x.date)+'</div></div>'+
      (x.done?'':'<button class="mini" data-act="edit" aria-label="עריכה">✎</button>')+
      '<button class="undo" data-act="del">מחיקה</button></div>';
  }
  function renderTodos(){
    var list = S.todos || [], open = list.filter(function(x){return !x.done;}), done = list.filter(function(x){return x.done;});
    $('tdOpen').innerHTML = open.length ? open.map(todoRow).join('') : '<div class="hint">לא חסר כלום 🍻</div>';
    $('tdDone').innerHTML = done.map(todoRow).join('');
    $('tdDoneWrap').classList.toggle('hidden', !done.length);
    var e = $('tdEdit'); if (e){ e.focus(); e.setSelectionRange(e.value.length, e.value.length); }
  }
  function todoCall(action, payload, okMsg){
    return api(action, payload).then(function(list){ S.todos=list; renderTodos(); if(okMsg) toast(okMsg); })
      .catch(function(e){ toast(errMsg(e),'bad'); refreshTodos(); });
  }
  function refreshTodos(){
    api('todo.list').then(function(list){ if(!S.editing){ S.todos=list; renderTodos(); } }).catch(function(){});
  }
  function addTodo(){
    var text = $('tdNew').value.trim(); if(!text){ $('tdNew').focus(); return; }
    var b=$('tdAdd'); b.disabled=true;
    S.tdReq = S.tdReq || uid();
    api('todo.create', { text:text }, S.tdReq).then(function(list){
      S.tdReq=null; $('tdNew').value=''; S.todos=list; renderTodos(); toast('✓ נוסף לרשימה');
    }).catch(function(e){ toast('לא נשמר: '+errMsg(e),'bad'); }).then(function(){ b.disabled=false; $('tdNew').focus(); });
  }
  $('tdAdd').onclick = addTodo;
  $('tdNew').onkeydown = function(e){ if(e.key==='Enter') addTodo(); };
  $('tdNew').oninput = function(){ S.tdReq=null; };
  function saveEdit(id){
    var v = $('tdEdit').value.trim(); if(!v){ toast('הפריט לא יכול להיות ריק','bad'); return; }
    var item = S.todos.find(function(x){return x.id===id;}); S.editing=null;
    if (item && item.text===v){ renderTodos(); return; }
    if (item) item.text=v; renderTodos();
    todoCall('todo.update', { todoId:id, text:v }, '✓ עודכן');
  }
  function onTodoClick(e){
    var btn = e.target.closest('[data-act]'); if(!btn) return;
    var row = btn.closest('.todo'), id = row.dataset.id, act = btn.dataset.act;
    var item = (S.todos||[]).find(function(x){return x.id===id;});
    if (act==='tick' && item){
      item.done = !item.done; renderTodos(); // instant on screen
      todoCall('todo.update', { todoId:id, done:item.done });
    } else if (act==='edit'){ S.editing=id; renderTodos(); }
    else if (act==='cancel'){ S.editing=null; renderTodos(); }
    else if (act==='save'){ saveEdit(id); }
    else if (act==='del'){
      twoTap(btn, function(){ todoCall('todo.delete', { todoId:id }, 'נמחק'); });
    }
  }
  $('tdOpen').onclick = onTodoClick;
  $('tdDone').onclick = onTodoClick;
  document.addEventListener('keydown', function(e){
    if (!S.editing || e.target.id!=='tdEdit') return;
    if (e.key==='Enter') saveEdit(S.editing);
    if (e.key==='Escape'){ S.editing=null; renderTodos(); }
  });

  // refresh the shift summary when the app comes back to the foreground
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState==='visible' && S.data){
      api('shift.get').then(renderShift).catch(function(){});
      if (S.tab==='todo') refreshTodos();
    }
  });

  $('pinLogo').src = document.querySelector('.logo').src; // the logo is embedded once, in the header
  S.pin = load(PIN_KEY);
  init();
})();
