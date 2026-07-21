(function(){
  'use strict';

  /* CHANGE THIS to your own secret phrase — this is what unlocks the edit button for you.
     Keep the URL with ?owner=... private; don't share it publicly. This is a light deterrent
     for casual visitors, not real security (anyone who reads the page source could find it). */
  var OWNER_SECRET = 'noor-owner-2026';

  var DATA = null;
  var currentArticleIdx = 0;
  var currentImgIndex = 0;
  var articleOpen = false;
  var activeIssueIndex = 0;   // which issue visitors are viewing
  var editingIssueIndex = 0;  // which issue is open in the edit panel
  var ownerUnlocked = false;
  var toastTimer = null;
  var touchStartX = 0, touchStartY = 0;

  /* ---------------- helpers ---------------- */
  function toArabicDigits(n){
    var map=['٠','١','٢','٣','٤','٥','٦','٧','٨','٩'];
    return String(n).replace(/[0-9]/g,function(d){return map[+d];});
  }

  function clampNum(v, min, max, fallback){
    var n = Number(v);
    if(isNaN(n)) return fallback;
    if(min!==undefined && n<min) n=min;
    if(max!==undefined && n>max) n=max;
    return n;
  }

  function showToast(msg){
    var t=document.getElementById('toast');
    if(!t){
      t=document.createElement('div');
      t.id='toast';
      document.body.appendChild(t);
    }
    t.textContent=msg;
    t.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer=setTimeout(function(){ t.classList.remove('show'); },2600);
  }

  /* ---------------- data ---------------- */
  function emptyArticle(){ return {title:'', images:[], imageDurations:[], cover:'', music:''}; }
  function emptyIssue(label){
    var arts=[]; for(var i=0;i<12;i++) arts.push(emptyArticle());
    return {label: label||'العدد الأول', articles: arts};
  }
  function normalizeArticle(a){
    a = a||{};
    return {
      title: typeof a.title==='string'? a.title : '',
      images: Array.isArray(a.images)? a.images.filter(function(s){return typeof s==='string';}).slice(0,2) : [],
      imageDurations: Array.isArray(a.imageDurations)? a.imageDurations.map(function(n){return clampNum(n,5,600,15);}).slice(0,2) : [],
      cover: typeof a.cover==='string'? a.cover : '',
      music: typeof a.music==='string'? a.music : ''
    };
  }
  function normalizeIssue(iss, fallbackLabel){
    iss = iss||{};
    var articles = Array.isArray(iss.articles)? iss.articles.slice(0,12).map(normalizeArticle) : [];
    while(articles.length<12) articles.push(emptyArticle());
    return {
      label: typeof iss.label==='string' && iss.label.trim()? iss.label : (fallbackLabel||'عدد'),
      articles: articles
    };
  }

  function loadSeed(){
    var defaults = { magazineTitle:'مجلة النور', authors:'', logo1:'', logo2:'', issues:[emptyIssue('العدد الأول')] };
    var seed=null;
    try{
      var raw = document.getElementById('seed-data').textContent;
      seed = JSON.parse(raw);
    }catch(e){ seed=null; }
    if(!seed || typeof seed!=='object') return defaults;

    var issues;
    if(Array.isArray(seed.issues) && seed.issues.length){
      issues = seed.issues.map(function(iss,i){ return normalizeIssue(iss, 'العدد '+toArabicDigits(i+1)); });
    } else if(Array.isArray(seed.articles)){
      // migrate old single-issue file format
      issues = [normalizeIssue({label:'العدد الأول', articles:seed.articles})];
    } else {
      issues = defaults.issues;
    }

    return {
      magazineTitle: typeof seed.magazineTitle==='string' && seed.magazineTitle.trim() ? seed.magazineTitle : defaults.magazineTitle,
      authors: typeof seed.authors==='string' ? seed.authors : defaults.authors,
      logo1: typeof seed.logo1==='string' ? seed.logo1 : '',
      logo2: typeof seed.logo2==='string' ? seed.logo2 : '',
      issues: issues
    };
  }

  function updateHeaderTexts(){
    var el=document.getElementById('magazine-title-display');
    if(el) el.textContent = DATA.magazineTitle || 'مجلة النور';
    document.title = DATA.magazineTitle || 'مجلة النور';

    var authorsWrap = document.getElementById('authors-credit');
    var authorsNames = document.getElementById('authors-names-display');
    if(DATA.authors && DATA.authors.trim()){
      authorsNames.textContent = DATA.authors;
      authorsWrap.style.display='flex';
    } else {
      authorsWrap.style.display='none';
    }

    updateLogoSlot(1, DATA.logo1);
    updateLogoSlot(2, DATA.logo2);
  }

  function updateLogoSlot(n, src){
    var slot = document.getElementById('logo-slot-'+n);
    var img = document.getElementById('logo-'+n+'-img');
    if(src){
      img.src = src;
      slot.classList.add('has-logo');
    } else {
      img.src = '';
      slot.classList.remove('has-logo');
    }
  }

  /* ---------------- owner access gate ---------------- */
  function checkOwnerAccess(){
    try{
      var params = new URLSearchParams(location.search);
      if(params.get('owner') === OWNER_SECRET){
        ownerUnlocked = true;
        document.getElementById('edit-toggle').classList.add('unlocked');
      }
    }catch(e){}
  }

  /* ---------------- current issue helper ---------------- */
  function currentIssueArticles(){
    var issue = DATA.issues[activeIssueIndex];
    return issue ? issue.articles : [];
  }

  /* ---------------- rendering: issue selector ---------------- */
  function renderIssueSelector(){
    var wrap=document.getElementById('issue-selector');
    wrap.innerHTML='';
    if(DATA.issues.length<=1){ wrap.style.display='none'; return; }
    wrap.style.display='flex';
    DATA.issues.forEach(function(iss,i){
      var pill=document.createElement('button');
      pill.type='button';
      pill.className='issue-pill'+(i===activeIssueIndex?' active':'');
      pill.textContent = iss.label || ('العدد '+toArabicDigits(i+1));
      pill.addEventListener('click', function(){
        activeIssueIndex=i;
        renderIssueSelector();
        renderHomeGrid();
      });
      wrap.appendChild(pill);
    });
  }

  /* ---------------- rendering: home grid ---------------- */
  function renderHomeGrid(){
    var grid=document.getElementById('home-grid');
    grid.innerHTML='';
    var anyContent=false;
    currentIssueArticles().forEach(function(art,i){
      if((art.images && art.images.length) || art.cover) anyContent=true;
      var card=document.createElement('div');
      card.className='home-card';
      card.setAttribute('role','button');
      card.setAttribute('tabindex','0');

      var badge=document.createElement('span');
      badge.className='badge';
      badge.textContent=toArabicDigits(i+1);
      card.appendChild(badge);

      var homeThumb = art.cover || (art.images && art.images[0]);
      if(homeThumb){
        var img=document.createElement('img');
        img.src=homeThumb;
        img.alt='';
        card.appendChild(img);
      } else {
        var ph=document.createElement('div');
        ph.className='placeholder-thumb';
        ph.textContent='🕌';
        card.appendChild(ph);
      }

      var cap=document.createElement('div');
      cap.className='cap';
      cap.textContent = (art.title && art.title.trim()) ? art.title : 'بانتظار العنوان…';
      card.appendChild(cap);

      var openThisArticle = function(){ openArticle(i); };
      card.addEventListener('click', openThisArticle);
      card.addEventListener('keydown', function(e){
        if(e.key==='Enter' || e.key===' '){ e.preventDefault(); openThisArticle(); }
      });

      grid.appendChild(card);
    });
    var hint=document.getElementById('empty-hint');
    if(hint) hint.style.display = anyContent? 'none':'flex';
  }

  var audioFadeTimer = null;
  function fadeAudioTo(audio, target, duration){
    clearInterval(audioFadeTimer);
    var steps = 24;
    var stepTime = Math.max(16, duration/steps);
    var start = audio.volume;
    var stepCount = 0;
    audioFadeTimer = setInterval(function(){
      stepCount++;
      var progress = stepCount/steps;
      audio.volume = start + (target-start)*Math.min(1,progress);
      if(progress>=1){ clearInterval(audioFadeTimer); }
    }, stepTime);
  }

  var musicEnabled = false; // sticky per-visit preference: true once the visitor presses play, until they explicitly press stop

  function isThisArticleMusicPlaying(art){
    var audio=document.getElementById('art-audio');
    return !!(art && art.music && !audio.paused && audio.src === art.music);
  }

  function updateMusicButton(){
    var art = currentIssueArticles()[currentArticleIdx];
    var btn=document.getElementById('btn-music-toggle');
    if(art && art.music){
      btn.style.display='flex';
      if(isThisArticleMusicPlaying(art)){
        btn.innerHTML = '<span class="music-icon">⏸</span> إيقاف الموسيقى';
        btn.classList.add('playing');
      } else {
        btn.innerHTML = '<span class="music-icon">🎵</span> تشغيل الموسيقى';
        btn.classList.remove('playing');
      }
    } else {
      btn.style.display='none';
    }
  }

  function playArticleMusic(art){
    var audio=document.getElementById('art-audio');
    clearInterval(audioFadeTimer);
    if(audio.src !== art.music){
      audio.src = art.music;
      audio.currentTime = 0;
    }
    audio.volume = 0;
    audio.play().catch(function(){});
    fadeAudioTo(audio, 1, 1800);
  }

  function autoStartMusicIfEnabled(){
    var art = currentIssueArticles()[currentArticleIdx];
    var audio = document.getElementById('art-audio');
    if(musicEnabled && art && art.music){
      if(audio.src !== art.music || audio.paused){
        playArticleMusic(art);
      }
    }
    updateMusicButton();
  }

  function toggleMusicPlay(){
    var art = currentIssueArticles()[currentArticleIdx];
    if(!art || !art.music) return;
    var audio=document.getElementById('art-audio');
    if(isThisArticleMusicPlaying(art)){
      clearInterval(audioFadeTimer);
      audio.pause();
      musicEnabled = false;
    } else {
      playArticleMusic(art);
      musicEnabled = true;
    }
    updateMusicButton();
  }

  function updateArticleNavButtons(art){
    var hasTwo = art.images && art.images.length>=2;
    document.getElementById('btn-prev').style.display = hasTwo? 'flex':'none';
    document.getElementById('btn-next').style.display = hasTwo? 'flex':'none';
  }

  /* ---------------- zoom & pan ---------------- */
  var zoomScale = 1, zoomTX = 0, zoomTY = 0;
  var zoomTouch = { mode:null, startDist:0, startScale:1, startX:0, startY:0, startTX:0, startTY:0 };

  function applyZoomTransform(){
    var wrap = document.getElementById('article-image-wrap');
    wrap.style.transform = 'scale('+zoomScale+') translate('+zoomTX+'px,'+zoomTY+'px)';
  }

  function resetZoom(){
    zoomScale = 1; zoomTX = 0; zoomTY = 0;
    var wrap = document.getElementById('article-image-wrap');
    wrap.style.transition = 'transform .25s ease';
    applyZoomTransform();
    setTimeout(function(){ wrap.style.transition=''; }, 260);
  }

  function clampZoomTranslate(){
    var maxOffset = (zoomScale-1) * 220;
    zoomTX = Math.max(-maxOffset, Math.min(maxOffset, zoomTX));
    zoomTY = Math.max(-maxOffset, Math.min(maxOffset, zoomTY));
  }

  function getTouchDistance(touches){
    var dx = touches[0].clientX - touches[1].clientX;
    var dy = touches[0].clientY - touches[1].clientY;
    return Math.sqrt(dx*dx + dy*dy);
  }

  /* ---------------- orientation hint ---------------- */
  var rotateHintDismissed = false;
  function checkOrientationHint(){
    var hint = document.getElementById('rotate-hint');
    if(!hint) return;
    var isPortrait = window.innerHeight > window.innerWidth;
    if(articleOpen && isPortrait && !rotateHintDismissed){
      hint.classList.add('show');
    } else {
      hint.classList.remove('show');
    }
  }

  var autoAdvanceTimer = null;
  function clearAutoAdvance(){
    clearTimeout(autoAdvanceTimer);
    autoAdvanceTimer = null;
  }
  function scheduleAutoAdvance(){
    clearAutoAdvance();
    var art = currentIssueArticles()[currentArticleIdx];
    if(!art || !art.images || art.images.length<2) return; // only relevant when the article has 2 images
    var durations = art.imageDurations || [];
    var dur = clampNum(durations[currentImgIndex], 5, 600, 15) * 1000;
    autoAdvanceTimer = setTimeout(function(){
      if(zoomScale>1.05){ scheduleAutoAdvance(); return; } // don't interrupt while examining a zoomed detail
      toggleArticleImage();
    }, dur);
  }

  function renderCurrentArticle(){
    var arts = currentIssueArticles();
    var art = arts[currentArticleIdx];
    var img1=document.getElementById('art-img-1');
    var img2=document.getElementById('art-img-2');
    if(currentImgIndex===0){
      img1.src = art.images[0] || '';
      img1.classList.add('show');
      img2.classList.remove('show');
    } else {
      img2.src = art.images[1] || '';
      img2.classList.add('show');
      img1.classList.remove('show');
    }
    document.getElementById('art-badge').textContent = toArabicDigits(currentArticleIdx+1) + ' / ' + toArabicDigits(arts.length);

    resetZoom();
    updateArticleNavButtons(art);
    autoStartMusicIfEnabled();
    checkOrientationHint();
    scheduleAutoAdvance();
  }

  function toggleArticleImage(){
    var art = currentIssueArticles()[currentArticleIdx];
    if(!art || !art.images || art.images.length<2) return;
    currentImgIndex = currentImgIndex===0 ? 1 : 0;
    renderCurrentArticle();
  }

  function openArticle(articleIdx){
    var art = currentIssueArticles()[articleIdx];
    if(!art || !art.images || art.images.length===0){
      showToast('لم تتم إضافة صورة لهذا المقال بعد');
      return;
    }
    articleOpen = true;
    currentArticleIdx = articleIdx;
    currentImgIndex = 0;
    document.getElementById('article-screen').classList.add('open');
    document.body.classList.add('lock-scroll');
    renderCurrentArticle();
  }

  function closeArticle(){
    articleOpen = false;
    document.getElementById('article-screen').classList.remove('open');
    document.body.classList.remove('lock-scroll');
    clearAutoAdvance();
    clearInterval(audioFadeTimer);
    document.getElementById('art-audio').pause(); // stop sound while not viewing any article; musicEnabled preference is kept for next entry
    resetZoom();
    checkOrientationHint();
  }

  function rebuildAndContinue(){
    if(activeIssueIndex >= DATA.issues.length) activeIssueIndex = DATA.issues.length-1;
    renderIssueSelector();
    renderHomeGrid();
    closeArticle();
  }

  /* ---------------- image processing ---------------- */
  function processImageFile(file, callback, maxW, maxH, quality){
    maxW = maxW || 1920; maxH = maxH || 1080; quality = quality || 0.85;
    if(!file || file.type.indexOf('image/')!==0){ showToast('يرجى اختيار ملف صورة صالح'); return; }
    var reader=new FileReader();
    reader.onload=function(ev){
      var img=new Image();
      img.onload=function(){
        var w=img.width, h=img.height;
        var ratio=Math.min(1, maxW/w, maxH/h);
        w=Math.round(w*ratio); h=Math.round(h*ratio);
        var canvas=document.createElement('canvas');
        canvas.width=w; canvas.height=h;
        var ctx=canvas.getContext('2d');
        ctx.drawImage(img,0,0,w,h);
        var dataUrl=canvas.toDataURL('image/jpeg',quality);
        callback(dataUrl);
      };
      img.onerror=function(){ showToast('تعذّر قراءة هذه الصورة'); };
      img.src=ev.target.result;
    };
    reader.onerror=function(){ showToast('تعذّر قراءة الملف'); };
    reader.readAsDataURL(file);
  }

  /* ---------------- edit panel: issue tabs ---------------- */
  function renderEditIssueTabs(){
    var wrap=document.getElementById('edit-issue-tabs');
    wrap.innerHTML='';
    DATA.issues.forEach(function(iss,i){
      var tab=document.createElement('div');
      tab.className='issue-edit-tab'+(i===editingIssueIndex?' active':'');

      var btn=document.createElement('button');
      btn.type='button';
      btn.className='issue-pill';
      btn.textContent = iss.label || ('العدد '+toArabicDigits(i+1));
      btn.addEventListener('click', function(){
        editingIssueIndex=i;
        renderEditIssueTabs();
        refreshEditList();
      });
      tab.appendChild(btn);

      if(DATA.issues.length>1){
        var del=document.createElement('button');
        del.type='button';
        del.className='issue-tab-delete';
        del.title='حذف هذا العدد';
        del.textContent='✕';
        del.addEventListener('click', function(){
          if(!confirm('حذف "'+(iss.label||'هذا العدد')+'" نهائياً؟')) return;
          DATA.issues.splice(i,1);
          if(editingIssueIndex>=DATA.issues.length) editingIssueIndex=DATA.issues.length-1;
          renderEditIssueTabs();
          refreshEditList();
        });
        tab.appendChild(del);
      }

      wrap.appendChild(tab);
    });

    var addBtn=document.createElement('button');
    addBtn.type='button';
    addBtn.className='btn btn-secondary';
    addBtn.id='add-issue-btn';
    addBtn.textContent='➕ إضافة عدد جديد';
    addBtn.addEventListener('click', function(){
      var n=DATA.issues.length+1;
      DATA.issues.push(emptyIssue('العدد '+toArabicDigits(n)));
      editingIssueIndex=DATA.issues.length-1;
      renderEditIssueTabs();
      refreshEditList();
      showToast('تمت إضافة عدد جديد — لا تنسَ تعبئة مقالاته ثم الحفظ والتنزيل');
    });
    wrap.appendChild(addBtn);
  }

  function renderIssueLabelField(){
    var input=document.getElementById('issue-label-input');
    var issue=DATA.issues[editingIssueIndex];
    input.value = issue ? (issue.label||'') : '';
  }

  /* ---------------- edit panel: article rows ---------------- */
  function createImageSlot(articleIdx, imgIdx, labelText){
    var art=DATA.issues[editingIssueIndex].articles[articleIdx];
    var wrap=document.createElement('div');
    wrap.className='image-slot';

    var label=document.createElement('span');
    label.className='image-slot-label';
    label.textContent=labelText;
    wrap.appendChild(label);

    var preview=document.createElement('div');
    preview.className='image-preview';
    if(art.images[imgIdx]){
      var pImg=document.createElement('img');
      pImg.src=art.images[imgIdx];
      preview.appendChild(pImg);
    } else {
      preview.classList.add('empty');
      preview.textContent='—';
    }
    wrap.appendChild(preview);

    var btnRow=document.createElement('div');
    btnRow.className='image-slot-btns';

    var uploadLabel=document.createElement('label');
    uploadLabel.className='btn btn-small btn-upload';
    uploadLabel.textContent = art.images[imgIdx]? 'تغيير الصورة':'إضافة صورة';
    var fileInput=document.createElement('input');
    fileInput.type='file';
    fileInput.accept='image/*';
    fileInput.addEventListener('change', function(e){
      var file=e.target.files[0];
      if(!file) return;
      processImageFile(file, function(dataUrl){
        var a = DATA.issues[editingIssueIndex].articles[articleIdx];
        a.images[imgIdx]=dataUrl;
        if(!a.imageDurations) a.imageDurations=[];
        if(!a.imageDurations[imgIdx]) a.imageDurations[imgIdx]=15;
        refreshEditList();
        showToast('تمت إضافة الصورة');
      });
    });
    uploadLabel.appendChild(fileInput);
    btnRow.appendChild(uploadLabel);

    if(art.images[imgIdx]){
      var removeBtn=document.createElement('button');
      removeBtn.type='button';
      removeBtn.className='btn btn-small btn-danger';
      removeBtn.textContent='حذف';
      removeBtn.addEventListener('click', function(){
        var a = DATA.issues[editingIssueIndex].articles[articleIdx];
        a.images.splice(imgIdx,1);
        if(a.imageDurations) a.imageDurations.splice(imgIdx,1);
        refreshEditList();
      });
      btnRow.appendChild(removeBtn);
    }

    wrap.appendChild(btnRow);

    // duration only makes sense once this slot actually has 2 images (only then does auto-advance apply)
    if(art.images[imgIdx] && art.images.length>=2){
      var durLabel=document.createElement('label');
      durLabel.className='field';
      durLabel.style.marginTop='6px';
      var durSpan=document.createElement('span');
      durSpan.textContent='مدة عرض هذه الصورة (ثانية)';
      var durInput=document.createElement('input');
      durInput.type='number';
      durInput.min=5; durInput.max=600;
      durInput.value=(art.imageDurations && art.imageDurations[imgIdx]) || 15;
      durInput.addEventListener('input', function(){
        var a = DATA.issues[editingIssueIndex].articles[articleIdx];
        if(!a.imageDurations) a.imageDurations=[];
        a.imageDurations[imgIdx]=clampNum(durInput.value,5,600,15);
      });
      durLabel.appendChild(durSpan);
      durLabel.appendChild(durInput);
      wrap.appendChild(durLabel);
    }

    return wrap;
  }

  function createLogoSlot(n){
    var src = DATA['logo'+n];
    var wrap=document.createElement('div');
    wrap.className='image-slot';

    var label=document.createElement('span');
    label.className='image-slot-label';
    label.textContent = 'شعار '+toArabicDigits(n)+' (يظهر أعلى الصفحة الرئيسية)';
    wrap.appendChild(label);

    var preview=document.createElement('div');
    preview.className='image-preview';
    if(src){
      var pImg=document.createElement('img');
      pImg.src=src;
      preview.appendChild(pImg);
    } else {
      preview.classList.add('empty');
      preview.textContent='—';
    }
    wrap.appendChild(preview);

    var btnRow=document.createElement('div');
    btnRow.className='image-slot-btns';

    var uploadLabel=document.createElement('label');
    uploadLabel.className='btn btn-small btn-upload';
    uploadLabel.textContent = src? 'تغيير الشعار':'إضافة شعار';
    var fileInput=document.createElement('input');
    fileInput.type='file';
    fileInput.accept='image/*';
    fileInput.addEventListener('change', function(e){
      var file=e.target.files[0];
      if(!file) return;
      processImageFile(file, function(dataUrl){
        DATA['logo'+n]=dataUrl;
        updateHeaderTexts();
        renderLogoEditSlots();
        showToast('تمت إضافة الشعار');
      }, 300, 300, 0.85);
    });
    uploadLabel.appendChild(fileInput);
    btnRow.appendChild(uploadLabel);

    if(src){
      var removeBtn=document.createElement('button');
      removeBtn.type='button';
      removeBtn.className='btn btn-small btn-danger';
      removeBtn.textContent='حذف';
      removeBtn.addEventListener('click', function(){
        DATA['logo'+n]='';
        updateHeaderTexts();
        renderLogoEditSlots();
      });
      btnRow.appendChild(removeBtn);
    }

    wrap.appendChild(btnRow);
    return wrap;
  }

  function renderLogoEditSlots(){
    var wrap = document.getElementById('logo-edit-slots');
    wrap.innerHTML='';
    wrap.appendChild(createLogoSlot(1));
    wrap.appendChild(createLogoSlot(2));
  }

  function createCoverImageSlot(articleIdx){
    var art=DATA.issues[editingIssueIndex].articles[articleIdx];
    var wrap=document.createElement('div');
    wrap.className='image-slot';

    var label=document.createElement('span');
    label.className='image-slot-label';
    label.textContent='صورة الغلاف (تظهر في الصفحة الرئيسية فقط)';
    wrap.appendChild(label);

    var preview=document.createElement('div');
    preview.className='image-preview';
    if(art.cover){
      var pImg=document.createElement('img');
      pImg.src=art.cover;
      preview.appendChild(pImg);
    } else {
      preview.classList.add('empty');
      preview.textContent='—';
    }
    wrap.appendChild(preview);

    var btnRow=document.createElement('div');
    btnRow.className='image-slot-btns';

    var uploadLabel=document.createElement('label');
    uploadLabel.className='btn btn-small btn-upload';
    uploadLabel.textContent = art.cover? 'تغيير صورة الغلاف':'إضافة صورة غلاف';
    var fileInput=document.createElement('input');
    fileInput.type='file';
    fileInput.accept='image/*';
    fileInput.addEventListener('change', function(e){
      var file=e.target.files[0];
      if(!file) return;
      processImageFile(file, function(dataUrl){
        DATA.issues[editingIssueIndex].articles[articleIdx].cover=dataUrl;
        refreshEditList();
        showToast('تمت إضافة صورة الغلاف');
      }, 640, 480, 0.75);
    });
    uploadLabel.appendChild(fileInput);
    btnRow.appendChild(uploadLabel);

    if(art.cover){
      var removeBtn=document.createElement('button');
      removeBtn.type='button';
      removeBtn.className='btn btn-small btn-danger';
      removeBtn.textContent='حذف';
      removeBtn.addEventListener('click', function(){
        DATA.issues[editingIssueIndex].articles[articleIdx].cover='';
        refreshEditList();
      });
      btnRow.appendChild(removeBtn);
    }

    wrap.appendChild(btnRow);
    return wrap;
  }

  function createMusicSlot(articleIdx){
    var art=DATA.issues[editingIssueIndex].articles[articleIdx];
    var wrap=document.createElement('div');
    wrap.className='image-slot';

    var label=document.createElement('span');
    label.className='image-slot-label';
    label.textContent='موسيقى المقال (اختياري)';
    wrap.appendChild(label);

    var preview=document.createElement('div');
    preview.className='image-preview';
    if(art.music){
      preview.textContent='🎵';
    } else {
      preview.classList.add('empty');
      preview.textContent='—';
    }
    wrap.appendChild(preview);

    var btnRow=document.createElement('div');
    btnRow.className='image-slot-btns';

    var uploadLabel=document.createElement('label');
    uploadLabel.className='btn btn-small btn-upload';
    uploadLabel.textContent = art.music? 'تغيير الموسيقى':'إضافة موسيقى';
    var fileInput=document.createElement('input');
    fileInput.type='file';
    fileInput.accept='audio/*';
    fileInput.addEventListener('change', function(){
      var file=fileInput.files[0];
      if(!file) return;
      if(file.size > 5*1024*1024){
        showToast('تنبيه: هذا المقطع كبير (~'+Math.round(file.size/1024/1024)+' م.ب) وقد يبطئ الفتح على الهاتف');
      }
      var reader=new FileReader();
      reader.onload=function(e){
        DATA.issues[editingIssueIndex].articles[articleIdx].music = e.target.result;
        refreshEditList();
        showToast('تمت إضافة الموسيقى');
      };
      reader.onerror=function(){ showToast('تعذّر قراءة الملف الصوتي'); };
      reader.readAsDataURL(file);
    });
    uploadLabel.appendChild(fileInput);
    btnRow.appendChild(uploadLabel);

    if(art.music){
      var removeBtn=document.createElement('button');
      removeBtn.type='button';
      removeBtn.className='btn btn-small btn-danger';
      removeBtn.textContent='حذف';
      removeBtn.addEventListener('click', function(){
        DATA.issues[editingIssueIndex].articles[articleIdx].music='';
        refreshEditList();
      });
      btnRow.appendChild(removeBtn);
    }

    wrap.appendChild(btnRow);
    return wrap;
  }

  function createArticleEditRow(i){
    var art=DATA.issues[editingIssueIndex].articles[i];
    var row=document.createElement('div');
    row.className='article-edit-item';

    var num=document.createElement('div');
    num.className='row-num';
    num.textContent=toArabicDigits(i+1);
    row.appendChild(num);

    var textCol=document.createElement('div');
    textCol.className='row-text-col';

    var titleLabel=document.createElement('label');
    titleLabel.className='field';
    var titleSpan=document.createElement('span');
    titleSpan.textContent='العنوان';
    var titleInput=document.createElement('input');
    titleInput.type='text';
    titleInput.maxLength=80;
    titleInput.value=art.title||'';
    titleInput.placeholder='عنوان المقال';
    titleInput.addEventListener('input', function(){ DATA.issues[editingIssueIndex].articles[i].title=titleInput.value; });
    titleLabel.appendChild(titleSpan);
    titleLabel.appendChild(titleInput);

    textCol.appendChild(titleLabel);
    row.appendChild(textCol);

    row.appendChild(createCoverImageSlot(i));
    row.appendChild(createImageSlot(i,0,'الصورة الأولى (تظهر عند فتح المقال)'));
    row.appendChild(createImageSlot(i,1,'الصورة الثانية (اختياري)'));
    row.appendChild(createMusicSlot(i));

    return row;
  }

  function refreshEditList(){
    renderIssueLabelField();
    var list=document.getElementById('article-edit-list');
    list.innerHTML='';
    var articles = DATA.issues[editingIssueIndex] ? DATA.issues[editingIssueIndex].articles : [];
    for(var i=0;i<articles.length;i++){
      list.appendChild(createArticleEditRow(i));
    }
  }

  function openEditModal(){
    if(!ownerUnlocked) return;
    closeArticle();
    document.getElementById('mag-title-input').value=DATA.magazineTitle||'';
    document.getElementById('authors-input').value=DATA.authors||'';
    renderLogoEditSlots();
    editingIssueIndex = DATA.issues.length-1;
    renderEditIssueTabs();
    refreshEditList();
    document.getElementById('edit-modal').classList.add('open');
    document.body.classList.add('lock-scroll');
  }

  function closeEditModal(){
    document.getElementById('edit-modal').classList.remove('open');
    document.body.classList.remove('lock-scroll');
    activeIssueIndex = DATA.issues.length-1;
    rebuildAndContinue();
  }

  function sanitizeHeadForExport(){
    // Our template never legitimately has <script> or <link> tags in <head> —
    // only <meta>, <title>, <style>. Anything else got added by a browser
    // extension (antivirus injection, etc.) and must never be saved into the file.
    var removed = 0;
    Array.from(document.head.children).forEach(function(el){
      var tag = el.tagName;
      if(tag==='SCRIPT' || tag==='LINK'){
        document.head.removeChild(el);
        removed++;
      }
    });
    return removed;
  }

  function stripMediaForExport(){
    // Every <img>/<audio> currently showing a data: URI (home-grid thumbnails,
    // edit-panel previews, open article view) duplicates data already stored
    // in seed-data. Strip them before serializing so they aren't saved twice;
    // they're regenerated from seed-data automatically on next render anyway.
    var saved = [];
    document.querySelectorAll('img[src^="data:"], audio[src^="data:"]').forEach(function(el){
      saved.push({el: el, src: el.getAttribute('src')});
      el.removeAttribute('src');
    });
    return saved;
  }
  function restoreMediaAfterExport(saved){
    saved.forEach(function(item){ item.el.setAttribute('src', item.src); });
  }

  /* ---------------- export ---------------- */
  function exportHTML(){
    var modal = document.getElementById('edit-modal');
    var wasModalOpen = modal.classList.contains('open');
    var hadLockScroll = document.body.classList.contains('lock-scroll');
    modal.classList.remove('open');
    document.body.classList.remove('lock-scroll'); // saved file must never start scroll-locked

    sanitizeHeadForExport();
    var editBtn = document.getElementById('edit-toggle');
    var wasUnlocked = editBtn.classList.contains('unlocked');
    editBtn.classList.remove('unlocked'); // exported file must always start locked

    var savedMedia = stripMediaForExport();
    document.getElementById('seed-data').textContent = JSON.stringify(DATA);
    var htmlContent = '<!DOCTYPE html>\n' + document.documentElement.outerHTML;
    restoreMediaAfterExport(savedMedia);

    // restore the current live session exactly as it was, unaffected by export
    if(wasUnlocked) editBtn.classList.add('unlocked');
    if(wasModalOpen) modal.classList.add('open');
    if(hadLockScroll) document.body.classList.add('lock-scroll');

    var blob = new Blob([htmlContent], {type:'text/html;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    var safeName = 'index';
    a.href=url;
    a.download=safeName+'.html';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function(){ URL.revokeObjectURL(url); },2000);
    showToast('تم حفظ الملف بنجاح ✓ ارفعه إلى موقعك ليحل محل القديم');
  }

  /* ---------------- fullscreen ---------------- */
  function toggleFullscreen(){
    var el=document.documentElement;
    var isFS = document.fullscreenElement || document.webkitFullscreenElement;
    if(!isFS){
      var req = el.requestFullscreen || el.webkitRequestFullscreen;
      if(req){ var p=req.call(el); if(p && p.catch) p.catch(function(){}); }
    } else {
      var exit = document.exitFullscreen || document.webkitExitFullscreen;
      if(exit) exit.call(document);
    }
  }

  /* ---------------- swipe (mobile) ---------------- */
  function wireSwipe(){
    var wrap=document.getElementById('article-image-wrap');

    wrap.addEventListener('touchstart', function(e){
      if(e.touches.length===2){
        zoomTouch.mode='pinch';
        zoomTouch.startDist=getTouchDistance(e.touches);
        zoomTouch.startScale=zoomScale;
      } else if(e.touches.length===1){
        if(zoomScale>1.05){
          zoomTouch.mode='pan';
          zoomTouch.startX=e.touches[0].clientX;
          zoomTouch.startY=e.touches[0].clientY;
          zoomTouch.startTX=zoomTX;
          zoomTouch.startTY=zoomTY;
        } else {
          zoomTouch.mode='swipe';
          touchStartX=e.touches[0].clientX;
          touchStartY=e.touches[0].clientY;
        }
      }
    }, {passive:true});

    wrap.addEventListener('touchmove', function(e){
      if(zoomTouch.mode==='pinch' && e.touches.length===2){
        var dist=getTouchDistance(e.touches);
        var newScale=zoomTouch.startScale*(dist/zoomTouch.startDist);
        zoomScale=Math.max(1, Math.min(4, newScale));
        clampZoomTranslate();
        applyZoomTransform();
      } else if(zoomTouch.mode==='pan' && e.touches.length===1){
        var dx=e.touches[0].clientX-zoomTouch.startX;
        var dy=e.touches[0].clientY-zoomTouch.startY;
        zoomTX=zoomTouch.startTX + dx/zoomScale;
        zoomTY=zoomTouch.startTY + dy/zoomScale;
        clampZoomTranslate();
        applyZoomTransform();
      }
    }, {passive:true});

    wrap.addEventListener('touchend', function(e){
      if(zoomTouch.mode==='swipe'){
        var dx=e.changedTouches[0].clientX-touchStartX;
        var dy=e.changedTouches[0].clientY-touchStartY;
        if(Math.abs(dx)>45 && Math.abs(dx)>Math.abs(dy)*1.2){
          toggleArticleImage();
        }
      } else if(zoomTouch.mode==='pinch'){
        if(zoomScale<=1.05){ resetZoom(); }
      }
      zoomTouch.mode=null;
    }, {passive:true});
  }

  /* ---------------- wiring ---------------- */
  function wireEvents(){
    document.getElementById('edit-toggle').addEventListener('click', openEditModal);
    document.getElementById('close-edit').addEventListener('click', closeEditModal);
    document.getElementById('export-btn').addEventListener('click', exportHTML);

    document.getElementById('mag-title-input').addEventListener('input', function(e){
      DATA.magazineTitle=e.target.value;
      updateHeaderTexts();
    });
    document.getElementById('authors-input').addEventListener('input', function(e){
      DATA.authors=e.target.value;
      updateHeaderTexts();
    });
    document.getElementById('issue-label-input').addEventListener('input', function(e){
      if(DATA.issues[editingIssueIndex]){
        DATA.issues[editingIssueIndex].label = e.target.value;
        renderEditIssueTabs();
      }
    });

    document.getElementById('btn-prev').addEventListener('click', toggleArticleImage);
    document.getElementById('btn-next').addEventListener('click', toggleArticleImage);
    document.getElementById('btn-close-article').addEventListener('click', closeArticle);
    document.getElementById('btn-fullscreen').addEventListener('click', toggleFullscreen);
    document.getElementById('btn-fullscreen-article').addEventListener('click', toggleFullscreen);
    document.getElementById('btn-music-toggle').addEventListener('click', toggleMusicPlay);
    document.getElementById('rotate-hint-close').addEventListener('click', function(){
      rotateHintDismissed = true;
      checkOrientationHint();
    });
    window.addEventListener('resize', checkOrientationHint);
    window.addEventListener('orientationchange', checkOrientationHint);

    document.addEventListener('keydown', function(e){
      var modalOpen = document.getElementById('edit-modal').classList.contains('open');
      if(modalOpen){
        if(e.key==='Escape') closeEditModal();
        return;
      }
      if(!articleOpen) return;
      if(e.key==='ArrowRight' || e.key==='ArrowLeft'){ toggleArticleImage(); }
      else if(e.key==='Escape'){ closeArticle(); }
      else if(e.key==='f' || e.key==='F'){ toggleFullscreen(); }
    });

    wireSwipe();
  }

  /* ---------------- init ---------------- */
  function init(){
    DATA = loadSeed();
    updateHeaderTexts();
    checkOwnerAccess();
    activeIssueIndex = DATA.issues.length-1;
    renderIssueSelector();
    renderHomeGrid();
    wireEvents();
  }

  document.addEventListener('DOMContentLoaded', init);
})();