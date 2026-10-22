(() => {
  "use strict";

  const GAME_DEFS = {
    tictactoe: { name:"Tic-Tac-Toe", icon:"✕○", min:2, max:2, blurb:"quick three-in-a-row" },
    connect4: { name:"Four in a Row", icon:"🔴", min:2, max:2, blurb:"drop pieces and connect four" },
    gomoku: { name:"Gomoku", icon:"●", min:2, max:2, blurb:"five stones in a row" },
    reversi: { name:"Reversi", icon:"◐", min:2, max:2, blurb:"flip the board in your favor" },
    mancala: { name:"Mancala", icon:"🪨", min:2, max:2, blurb:"sow stones and capture" },
    chess: { name:"Chess", icon:"♞", min:2, max:2, blurb:"full chess with castling, en passant + promotion" },
    checkers: { name:"Checkers", icon:"⛀", min:2, max:2, blurb:"captures, kings and forced jumps" },
    pool8: { name:"8-Ball", icon:"🎱", min:2, max:2, blurb:"solids vs stripes with a timing-based shot meter" },
    pool9: { name:"9-Ball", icon:"⑨", min:2, max:2, blurb:"sink balls in order and finish on the nine" },
    cuppong: { name:"Cup Pong", icon:"🥤", min:2, max:2, blurb:"sink the other side's cups" },
    dots: { name:"Dots & Boxes", icon:"▦", min:2, max:4, blurb:"claim boxes by closing edges" },
    filler: { name:"Filler", icon:"🎨", min:2, max:4, blurb:"grow your color territory" },
    anagrams: { name:"Anagrams", icon:"🔀", min:2, max:8, blurb:"unscramble words and race to five" },
    wordchain: { name:"Word Chain", icon:"🔤", min:2, max:8, blurb:"each word starts with the last letter" },
    darts: { name:"Darts", icon:"🎯", min:2, max:4, blurb:"nine throws each — highest score wins" },
    archery: { name:"Archery", icon:"🏹", min:2, max:4, blurb:"five arrows each — hit the center" },
    basketball: { name:"Basketball", icon:"🏀", min:2, max:4, blurb:"ten timing shots each" },
    minigolf: { name:"Mini Golf", icon:"⛳", min:2, max:4, blurb:"five holes — lowest total wins" },
    shuffleboard: { name:"Shuffleboard", icon:"🥌", min:2, max:4, blurb:"eight slides each — land close to the target" }
  };

  const playerColors = ["#e76f91","#e7b94e","#62a987","#6a9bd5","#9378c6","#e18b58","#71818f","#bb6c9d"];
  let ctx = null;
  let channel = null;
  let sessions = [];
  let activeId = null;
  let reloadTimer = null;
  const chessSelection = new Map();
  const checkersSelection = new Map();
  const WORD_BANK = ["stasis","orchid","lantern","puzzle","velvet","planet","silver","marble","sunset","violet","rocket","candle","forest","coffee","magnet","window","pocket","garden","comet","bridge","lilac","camera","picnic","winter","summer","signal","whisper","button","tunnel","pigeon","castle","breeze","memory","sunday","cloudy","ribbon","circle","paper","stereo","copper"];

  const esc = value => String(value ?? "").replaceAll("&","&amp;").replaceAll("<","&lt;").replaceAll(">","&gt;").replaceAll('"',"&quot;").replaceAll("'","&#039;");
  const uid = () => ctx?.user?.id;
  const roomId = () => ctx?.roomContext?.room?.id;
  const memberById = id => ctx?.roomContext?.members?.find(m => m.user_id === id);
  const nameOf = id => memberById(id)?.profile?.display_name || (id === uid() ? ctx?.profileName || "you" : "member");
  const isPlayer = session => (session.player_ids || []).includes(uid());
  const isHost = session => session.host_user_id === uid();
  const isManager = () => !!ctx?.roomContext?.isManager;

  function def(type){ return GAME_DEFS[type] || {name:type,icon:"🎮",min:2,max:2,blurb:"room game"}; }
  function nextPlayer(session, currentId = uid()) {
    const ids = session.player_ids || [];
    const idx = Math.max(0, ids.indexOf(currentId));
    return ids[(idx + 1) % ids.length] || null;
  }
  function relative(value){
    if(!value) return "";
    const d = Date.now() - new Date(value).getTime();
    const m = Math.max(0, Math.floor(d/60000));
    if(m < 1) return "just now";
    if(m < 60) return `${m}m ago`;
    const h = Math.floor(m/60);
    if(h < 24) return `${h}h ago`;
    return `${Math.floor(h/24)}d ago`;
  }
  function statusText(session){
    if(session.status === "waiting") return `${session.player_ids.length}/${session.max_players} joined`;
    if(session.status === "active") return `${nameOf(session.turn_user_id)}'s turn`;
    if(session.status === "finished") {
      const winners = session.winner_user_ids || [];
      return winners.length ? `${winners.map(nameOf).join(" + ")} won` : "draw";
    }
    return session.status;
  }
  function showToast(msg,type=""){ ctx?.toast?.(msg,type); }
  function nav(path){ ctx?.navigate?.(path); }

  function stop(){
    if(channel && ctx?.client) ctx.client.removeChannel(channel);
    channel = null;
    clearTimeout(reloadTimer);
    reloadTimer = null;
    ctx = null;
    sessions = [];
    activeId = null;
  }

  async function fetchSessions(){
    const { data, error } = await ctx.client.from("game_sessions")
      .select("id,room_id,game_type,host_user_id,status,player_ids,max_players,state,turn_user_id,winner_user_ids,version,created_at,updated_at,finished_at")
      .eq("room_id", roomId()).order("updated_at", { ascending:false }).limit(40);
    if(error) throw error;
    sessions = data || [];
    return sessions;
  }

  function subscribe(){
    if(channel) ctx.client.removeChannel(channel);
    channel = ctx.client.channel(`stasis-games-${roomId()}-${uid()}`)
      .on("postgres_changes", {event:"*", schema:"public", table:"game_sessions", filter:`room_id=eq.${roomId()}`}, () => {
        clearTimeout(reloadTimer);
        reloadTimer = setTimeout(() => refresh(false), 180);
      }).subscribe();
  }

  async function mount(options){
    stop();
    ctx = options;
    activeId = options.gameId || null;
    try {
      await fetchSessions();
      render();
      wire();
      subscribe();
    } catch(error) {
      options.mount.innerHTML = `<section class="panel arcade-empty"><h3>arcade couldn't load</h3><p>${esc(error.message || error)}</p></section>`;
    }
  }

  async function refresh(preserve = true){
    if(!ctx) return;
    try {
      await fetchSessions();
      if(!preserve) activeId = ctx.gameId || activeId;
      render();
      wire();
    } catch(error){ showToast(error.message || "Couldn’t refresh the arcade.","error"); }
  }

  function leaderboardHTML(){
    const finished = sessions.filter(s => s.status === "finished");
    const wins = new Map();
    finished.forEach(s => (s.winner_user_ids || []).forEach(id => wins.set(id,(wins.get(id)||0)+1)));
    const ranked = [...wins.entries()].sort((a,b)=>b[1]-a[1]).slice(0,5);
    if(!ranked.length) return "";
    return `<div class="player-strip">${ranked.map(([id,n])=>`<span class="game-player-chip">${esc(nameOf(id))} · ${n} win${n===1?"":"s"}</span>`).join("")}</div>`;
  }

  function hubHTML(){
    const recent = sessions.slice(0,12);
    return `<div class="arcade-shell">
      <section class="panel arcade-hero">
        <div><span class="arcade-kicker">room arcade</span><h2>play something together ♡</h2><p>Games stay inside this Stasis Room and sync live across devices.</p></div>
        ${leaderboardHTML()}
      </section>
      <section class="arcade-section"><div class="arcade-section-head"><h3>start a game</h3><span class="hint-text">2-player + group games</span></div>
        <div class="arcade-grid">${Object.entries(GAME_DEFS).map(([key,g])=>`<button class="game-pick" data-create-game="${key}" type="button"><span class="game-icon">${g.icon}</span><strong>${esc(g.name)}</strong><small>${esc(g.blurb)}</small><span class="players-pill">${g.min===g.max?`${g.min} players`:`${g.min}–${g.max} players`}</span></button>`).join("")}</div>
      </section>
      <section class="arcade-section"><div class="arcade-section-head"><h3>room games</h3><span class="hint-text">${recent.length} recent</span></div>
        <div class="game-session-list">${recent.length?recent.map(sessionCardHTML).join(""):`<div class="panel arcade-empty">No games yet. Start one above.</div>`}</div>
      </section>
    </div>`;
  }

  function sessionCardHTML(s){
    const g = def(s.game_type);
    const names = (s.player_ids || []).map(nameOf).join(", ");
    const joined = isPlayer(s);
    const canJoin = s.status === "waiting" && !joined && s.player_ids.length < s.max_players;
    const canStart = s.status === "waiting" && isHost(s) && s.player_ids.length >= g.min;
    return `<article class="panel game-session-card">
      <div class="game-session-main"><div class="game-session-icon">${g.icon}</div><div class="game-session-copy"><strong>${esc(g.name)}</strong><span>${esc(names || "waiting for players")} · ${esc(statusText(s))} · ${esc(relative(s.updated_at))}</span></div></div>
      <div class="game-session-actions"><span class="game-status-pill ${esc(s.status)}">${esc(s.status)}</span>
        ${canJoin?`<button class="btn primary" data-join-game="${s.id}" type="button">join</button>`:""}
        ${canStart?`<button class="btn primary" data-start-game="${s.id}" type="button">start</button>`:""}
        ${joined || s.status === "finished" ? `<button class="btn soft" data-open-game="${s.id}" type="button">open</button>`:""}
        ${(isHost(s)||isManager()) && s.status === "waiting"?`<button class="btn ghost" data-cancel-game="${s.id}" type="button">cancel</button>`:""}
      </div>
    </article>`;
  }

  function gameViewHTML(s){
    const g = def(s.game_type);
    const playerChips = (s.player_ids || []).map((id,i)=>`<span class="game-player-chip ${s.turn_user_id===id?"turn":""} ${(s.winner_user_ids||[]).includes(id)?"winner":""}" style="--player-color:${playerColors[i%playerColors.length]}">${esc(nameOf(id))}${id===uid()?" · you":""}</span>`).join("");
    const board = s.status === "waiting" ? lobbyHTML(s) : renderGameBoard(s);
    return `<div class="game-view">
      <div class="game-topline"><button class="btn ghost" data-back-arcade type="button">← arcade</button><span class="game-status-pill ${esc(s.status)}">${esc(s.status)}</span></div>
      <section class="panel arcade-hero"><div class="game-title"><span class="game-icon">${g.icon}</span><div><h2>${esc(g.name)}</h2><p>${esc(statusText(s))}</p></div></div><div class="player-strip">${playerChips}</div></section>
      <section class="panel game-board-panel">${board}</section>
      <div class="game-actions">
        ${s.status === "active" && isPlayer(s)?`<button class="btn ghost" data-resign-game="${s.id}" type="button">resign</button>`:""}
        ${s.status === "finished" && isPlayer(s)?`<button class="btn primary" data-rematch-game="${s.id}" type="button">rematch</button>`:""}
        ${(isHost(s)||isManager()) && s.status === "waiting"?`<button class="btn danger" data-cancel-game="${s.id}" type="button">cancel game</button>`:""}
      </div>
    </div>`;
  }

  function lobbyHTML(s){
    const g = def(s.game_type);
    const joined = isPlayer(s);
    return `<div class="arcade-empty"><div class="empty-heart">${g.icon}</div><h3>game lobby</h3><p>${esc((s.player_ids||[]).map(nameOf).join(", "))}</p><p>${s.player_ids.length}/${s.max_players} players · needs ${g.min} to start</p><div class="game-actions">
      ${!joined && s.player_ids.length<s.max_players?`<button class="btn primary" data-join-game="${s.id}" type="button">join game</button>`:""}
      ${isHost(s)&&s.player_ids.length>=g.min?`<button class="btn primary" data-start-game="${s.id}" type="button">start</button>`:""}
      ${joined&&!isHost(s)?`<button class="btn ghost" data-leave-game="${s.id}" type="button">leave lobby</button>`:""}
    </div></div>`;
  }

  function render(){
    if(!ctx?.mount) return;
    const session = activeId ? sessions.find(s=>s.id===activeId) : null;
    ctx.mount.innerHTML = session ? gameViewHTML(session) : hubHTML();
  }

  function wire(){
    if(!ctx?.mount) return;
    ctx.mount.querySelectorAll("[data-create-game]").forEach(b=>b.addEventListener("click",()=>createGame(b.dataset.createGame)));
    ctx.mount.querySelectorAll("[data-join-game]").forEach(b=>b.addEventListener("click",()=>joinGame(b.dataset.joinGame)));
    ctx.mount.querySelectorAll("[data-start-game]").forEach(b=>b.addEventListener("click",()=>startGame(b.dataset.startGame)));
    ctx.mount.querySelectorAll("[data-open-game]").forEach(b=>b.addEventListener("click",()=>openGame(b.dataset.openGame)));
    ctx.mount.querySelectorAll("[data-cancel-game]").forEach(b=>b.addEventListener("click",()=>cancelGame(b.dataset.cancelGame)));
    ctx.mount.querySelectorAll("[data-leave-game]").forEach(b=>b.addEventListener("click",()=>leaveGame(b.dataset.leaveGame)));
    ctx.mount.querySelectorAll("[data-resign-game]").forEach(b=>b.addEventListener("click",()=>resignGame(b.dataset.resignGame)));
    ctx.mount.querySelectorAll("[data-rematch-game]").forEach(b=>b.addEventListener("click",()=>rematchGame(b.dataset.rematchGame)));
    ctx.mount.querySelector("[data-back-arcade]")?.addEventListener("click",()=>{ activeId=null; nav(`room/${roomId()}/games`); });
    const s = activeId ? sessions.find(x=>x.id===activeId) : null;
    if(s?.status === "active") wireGameBoard(s);
  }

  async function rpc(name,args){
    const {data,error}=await ctx.client.rpc(name,args); if(error) throw error; return data;
  }
  async function createGame(type){
    try{
      const g=def(type);
      const id=await rpc("create_stasis_game",{p_room:roomId(),p_game_type:type});
      showToast(`${g.name} lobby created ♡`,"success");
      activeId=id; nav(`room/${roomId()}/games/${id}`);
    }catch(error){showToast(error.message||"Couldn’t create game.","error");}
  }
  async function joinGame(id){ try{await rpc("join_stasis_game",{p_game:id}); activeId=id; await refresh();}catch(e){showToast(e.message,"error");} }
  async function leaveGame(id){ try{await rpc("leave_stasis_game",{p_game:id}); activeId=null; nav(`room/${roomId()}/games`);}catch(e){showToast(e.message,"error");} }
  async function cancelGame(id){ try{await rpc("cancel_stasis_game",{p_game:id}); activeId=null; nav(`room/${roomId()}/games`);}catch(e){showToast(e.message,"error");} }
  async function resignGame(id){ if(!confirm("Resign this game?")) return; try{await rpc("resign_stasis_game",{p_game:id}); await refresh();}catch(e){showToast(e.message,"error");} }
  async function rematchGame(id){ try{const next=await rpc("rematch_stasis_game",{p_game:id}); activeId=next; nav(`room/${roomId()}/games/${next}`);}catch(e){showToast(e.message,"error");} }
  function openGame(id){ activeId=id; nav(`room/${roomId()}/games/${id}`); }

  async function startGame(id){
    const s=sessions.find(x=>x.id===id); if(!s) return;
    try{
      const initial=initialState(s.game_type,s.player_ids);
      await rpc("start_stasis_game",{p_game:id,p_state:initial,p_first_turn:s.player_ids[0]});
      activeId=id; await refresh();
    }catch(e){showToast(e.message||"Couldn’t start game.","error");}
  }

  async function submitState(session,state,nextTurn,status="active",winners=[]){
    try{
      await rpc("submit_stasis_game_state",{
        p_game:session.id,p_expected_version:session.version,p_state:state,p_next_turn:nextTurn,p_status:status,p_winners:winners
      });
      await refresh();
    }catch(e){showToast(e.message||"That move didn’t save. Try again.","error"); await refresh();}
  }

  function initialState(type,players){
    switch(type){
      case "tictactoe": return {board:Array(9).fill(null)};
      case "connect4": return {board:Array(42).fill(null)};
      case "gomoku": return {board:Array(225).fill(null)};
      case "reversi": {const b=Array(64).fill(null); b[27]=1;b[28]=0;b[35]=0;b[36]=1;return{board:b};}
      case "mancala": return {pits:[4,4,4,4,4,4,0,4,4,4,4,4,4,0]};
      case "chess": return {fen:"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1",last:null};
      case "checkers": return initCheckers();
      case "pool8": return {pocketed:[],last:null};
      case "pool9": return {pocketed:[],last:null};
      case "cuppong": return {cups:[Array(6).fill(true),Array(6).fill(true)],last:null};
      case "dots": return {h:Array(20).fill(null),v:Array(20).fill(null),boxes:Array(16).fill(null)};
      case "filler": return initFiller(players.length);
      case "anagrams": return initAnagrams(players.length);
      case "wordchain": return {words:[]};
      case "darts": return initScoreGame(players.length,9);
      case "archery": return initScoreGame(players.length,5);
      case "basketball": return initScoreGame(players.length,10);
      case "minigolf": return {scores:Array(players.length).fill(0),shots:Array(players.length).fill(0),hole:1,last:null};
      case "shuffleboard": return initScoreGame(players.length,8);
      default:return{};
    }
  }

  function renderGameBoard(s){
    const message=s.status==="finished"?statusText(s):(s.turn_user_id===uid()?"your turn":`${nameOf(s.turn_user_id)}'s turn`);
    let board="";
    switch(s.game_type){
      case "tictactoe": board=tttHTML(s);break;
      case "connect4": board=connectHTML(s);break;
      case "gomoku": board=gomokuHTML(s);break;
      case "reversi": board=reversiHTML(s);break;
      case "mancala": board=mancalaHTML(s);break;
      case "chess": board=chessHTML(s);break;
      case "checkers": board=checkersHTML(s);break;
      case "pool8": board=poolHTML(s);break;
      case "pool9": board=pool9HTML(s);break;
      case "cuppong": board=cupPongHTML(s);break;
      case "dots": board=dotsHTML(s);break;
      case "filler": board=fillerHTML(s);break;
      case "anagrams": board=anagramsHTML(s);break;
      case "wordchain": board=wordChainHTML(s);break;
      case "darts": board=skillScoreHTML(s,"darts");break;
      case "archery": board=skillScoreHTML(s,"archery");break;
      case "basketball": board=skillScoreHTML(s,"basketball");break;
      case "minigolf": board=miniGolfHTML(s);break;
      case "shuffleboard": board=skillScoreHTML(s,"shuffleboard");break;
      default: board="<p>Unknown game.</p>";
    }
    return `<p class="game-message">${esc(message)}</p>${board}`;
  }

  function mySeat(s){return (s.player_ids||[]).indexOf(uid());}
  function canMove(s){return s.status==="active"&&s.turn_user_id===uid();}
  function tttHTML(s){
    const b=s.state?.board||[];return `<div class="board-grid ttt-board">${b.map((v,i)=>`<button class="board-cell" data-ttt="${i}" ${!canMove(s)||v!==null?"disabled":""}>${v===0?"✕":v===1?"○":""}</button>`).join("")}</div>`;
  }
  function tttWin(b,seat){const L=[[0,1,2],[3,4,5],[6,7,8],[0,3,6],[1,4,7],[2,5,8],[0,4,8],[2,4,6]];return L.some(x=>x.every(i=>b[i]===seat));}
  function connectHTML(s){const b=s.state?.board||[];return `<div class="board-grid connect-board">${b.map((v,i)=>`<button class="board-cell connect-cell ${v===0?"piece-0":v===1?"piece-1":""}" data-connect-col="${i%7}" ${!canMove(s)?"disabled":""}></button>`).join("")}</div>`;}
  function connectWin(b,seat){for(let r=0;r<6;r++)for(let c=0;c<7;c++){for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){let ok=true;for(let k=0;k<4;k++){const rr=r+dr*k,cc=c+dc*k;if(rr<0||rr>=6||cc<0||cc>=7||b[rr*7+cc]!==seat){ok=false;break;}}if(ok)return true;}}return false;}
  function gomokuHTML(s){const b=s.state?.board||[];return `<div class="board-grid gomoku-board">${b.map((v,i)=>`<button class="board-cell" data-gomoku="${i}" ${!canMove(s)||v!==null?"disabled":""}>${v===null?"":`<span class="stone stone-${v}"></span>`}</button>`).join("")}</div>`;}
  function gomokuWin(b,seat,idx){const r=Math.floor(idx/15),c=idx%15;for(const[dr,dc]of[[0,1],[1,0],[1,1],[1,-1]]){let n=1;for(const sign of[-1,1]){let rr=r+dr*sign,cc=c+dc*sign;while(rr>=0&&rr<15&&cc>=0&&cc<15&&b[rr*15+cc]===seat){n++;rr+=dr*sign;cc+=dc*sign;}}if(n>=5)return true;}return false;}

  function revDirs(){return [[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]];}
  function revFlips(b,seat,idx){if(b[idx]!==null)return[];const r=Math.floor(idx/8),c=idx%8,out=[];for(const[dr,dc]of revDirs()){let rr=r+dr,cc=c+dc,line=[];while(rr>=0&&rr<8&&cc>=0&&cc<8){const v=b[rr*8+cc];if(v===null){line=[];break;}if(v===seat)break;line.push(rr*8+cc);rr+=dr;cc+=dc;}if(line.length&&rr>=0&&rr<8&&cc>=0&&cc<8&&b[rr*8+cc]===seat)out.push(...line);}return out;}
  function revLegal(b,seat){const a=[];for(let i=0;i<64;i++)if(revFlips(b,seat,i).length)a.push(i);return a;}
  function reversiHTML(s){const b=s.state?.board||[];const seat=mySeat(s);const legal=canMove(s)?new Set(revLegal(b,seat)):new Set();return `<div class="board-grid reversi-board">${b.map((v,i)=>`<button class="board-cell" data-reversi="${i}" ${!legal.has(i)?"disabled":""}>${v===null?(legal.has(i)?'<span class="legal-dot"></span>':""):`<span class="reversi-piece reversi-${v}"></span>`}</button>`).join("")}</div><p class="game-message">dark ${b.filter(x=>x===0).length} · light ${b.filter(x=>x===1).length}</p>`;}

  function mancalaHTML(s){const p=s.state?.pits||[];const seat=mySeat(s);const top=[12,11,10,9,8,7],bottom=[0,1,2,3,4,5];return `<div class="mancala-board"><div class="mancala-store left">${p[13]||0}</div>${top.map((i,k)=>`<button class="mancala-pit mancala-top" style="grid-column:${k+2}" data-mancala="${i}" ${!canMove(s)||seat!==1||!p[i]?"disabled":""}>${p[i]||0}</button>`).join("")}${bottom.map((i,k)=>`<button class="mancala-pit mancala-bottom" style="grid-column:${k+2}" data-mancala="${i}" ${!canMove(s)||seat!==0||!p[i]?"disabled":""}>${p[i]||0}</button>`).join("")}<div class="mancala-store right">${p[6]||0}</div></div>`;}

  function dotsHTML(s){
    const st=s.state||{},h=st.h||[],v=st.v||[],boxes=st.boxes||[];let html='<div class="dots-board">';
    for(let gr=0;gr<9;gr++)for(let gc=0;gc<9;gc++){
      const row=gr+1,col=gc+1;
      if(gr%2===0&&gc%2===0)html+=`<span class="dot" style="grid-row:${row};grid-column:${col}"></span>`;
      else if(gr%2===0&&gc%2===1){const r=gr/2,c=(gc-1)/2,idx=r*4+c,owner=h[idx];html+=`<button class="edge h ${owner!==null&&owner!==undefined?'on':''}" style="grid-row:${row};grid-column:${col};--edge-color:${owner!==null&&owner!==undefined?playerColors[owner%8]:'#999'}" data-dot-h="${idx}" ${!canMove(s)||owner!==null&&owner!==undefined?'disabled':''}></button>`;}
      else if(gr%2===1&&gc%2===0){const r=(gr-1)/2,c=gc/2,idx=r*5+c,owner=v[idx];html+=`<button class="edge v ${owner!==null&&owner!==undefined?'on':''}" style="grid-row:${row};grid-column:${col};--edge-color:${owner!==null&&owner!==undefined?playerColors[owner%8]:'#999'}" data-dot-v="${idx}" ${!canMove(s)||owner!==null&&owner!==undefined?'disabled':''}></button>`;}
      else {const r=(gr-1)/2,c=(gc-1)/2,idx=r*4+c,owner=boxes[idx];html+=`<span class="box-owner" style="grid-row:${row};grid-column:${col};--box-color:${owner!==null&&owner!==undefined?playerColors[owner%8]:'transparent'}">${owner!==null&&owner!==undefined?owner+1:''}</span>`;}
    }
    html+='</div>';const scores=(s.player_ids||[]).map((id,i)=>`${esc(nameOf(id))} ${boxes.filter(x=>x===i).length}`).join(' · ');return html+`<p class="game-message">${scores}</p>`;
  }

  function initFiller(n){
    const colors=Array.from({length:81},()=>Math.floor(Math.random()*6));const starts=[0,8,72,80].slice(0,n);const used=[];starts.forEach((idx,i)=>{let c=colors[idx];while(used.includes(c)){c=(c+1)%6;}colors[idx]=c;used.push(c);});const owners=Array(81).fill(null);starts.forEach((idx,i)=>owners[idx]=i);return{colors,owners,current:used};
  }
  function fillerHTML(s){const st=s.state||{},colors=st.colors||[],owners=st.owners||[],current=st.current||[];const seat=mySeat(s);const used=new Set(current);return `<div class="board-grid filler-board">${colors.map((c,i)=>`<span class="filler-cell color-${c} ${owners[i]!==null&&owners[i]!==undefined?'filler-owner':''}" title="${owners[i]!==null&&owners[i]!==undefined?nameOf(s.player_ids[owners[i]]):''}" style="${owners[i]!==null&&owners[i]!==undefined?`box-shadow:inset 0 0 0 3px ${playerColors[owners[i]%8]}`:''}"></span>`).join('')}</div><div class="filler-palette">${[0,1,2,3,4,5].map(c=>`<button class="color-pick color-${c}" data-filler-color="${c}" ${!canMove(s)||used.has(c)?'disabled':''}></button>`).join('')}</div><p class="game-message">${s.player_ids.map((id,i)=>`${esc(nameOf(id))} ${owners.filter(x=>x===i).length}`).join(' · ')}</p>`;}
  function wordChainHTML(s){const words=s.state?.words||[];const last=words.at(-1)||"";const letter=last?last.slice(-1).toUpperCase():"ANY";return `<div class="word-chain"><div class="letter-prompt">${esc(letter)}</div><div class="word-history">${words.map(w=>`<span class="word-chip">${esc(w)}</span>`).join('')||'<span class="hint-text">be the first word</span>'}</div>${canMove(s)?`<form class="word-input-row" id="wordChainForm"><input id="wordChainInput" maxlength="32" autocomplete="off" placeholder="${last?`word starting with ${esc(letter)}`:'type any word'}"/><button class="btn primary" type="submit">play</button></form>`:''}<p class="hint-text">Words are checked for format and repeats, not against a dictionary.</p></div>`;}

  function wireGameBoard(s){
    ctx.mount.querySelectorAll('[data-ttt]').forEach(b=>b.addEventListener('click',()=>moveTTT(s,+b.dataset.ttt)));
    ctx.mount.querySelectorAll('[data-connect-col]').forEach(b=>b.addEventListener('click',()=>moveConnect(s,+b.dataset.connectCol)));
    ctx.mount.querySelectorAll('[data-gomoku]').forEach(b=>b.addEventListener('click',()=>moveGomoku(s,+b.dataset.gomoku)));
    ctx.mount.querySelectorAll('[data-reversi]').forEach(b=>b.addEventListener('click',()=>moveReversi(s,+b.dataset.reversi)));
    ctx.mount.querySelectorAll('[data-mancala]').forEach(b=>b.addEventListener('click',()=>moveMancala(s,+b.dataset.mancala)));
    ctx.mount.querySelectorAll('[data-chess]').forEach(b=>b.addEventListener('click',()=>moveChessClick(s,+b.dataset.chess)));
    ctx.mount.querySelectorAll('[data-checkers]').forEach(b=>b.addEventListener('click',()=>moveCheckersClick(s,+b.dataset.checkers)));
    ctx.mount.querySelector('#poolShoot')?.addEventListener('click',()=>movePool(s));
    ctx.mount.querySelector('#pool9Shoot')?.addEventListener('click',()=>movePool9(s));
    ctx.mount.querySelectorAll('[data-cup]').forEach(b=>b.addEventListener('click',()=>moveCupPong(s,+b.dataset.cup)));
    ctx.mount.querySelectorAll('[data-dot-h]').forEach(b=>b.addEventListener('click',()=>moveDots(s,'h',+b.dataset.dotH)));
    ctx.mount.querySelectorAll('[data-dot-v]').forEach(b=>b.addEventListener('click',()=>moveDots(s,'v',+b.dataset.dotV)));
    ctx.mount.querySelectorAll('[data-filler-color]').forEach(b=>b.addEventListener('click',()=>moveFiller(s,+b.dataset.fillerColor)));
    ctx.mount.querySelector('#anagramForm')?.addEventListener('submit',e=>{e.preventDefault();moveAnagram(s,ctx.mount.querySelector('#anagramInput')?.value||'');});
    ctx.mount.querySelector('#skillShoot')?.addEventListener('click',()=>moveSkillScore(s,s.game_type));
    ctx.mount.querySelector('#golfShoot')?.addEventListener('click',()=>moveMiniGolf(s));
    ctx.mount.querySelector('#wordChainForm')?.addEventListener('submit',e=>{e.preventDefault();moveWordChain(s,ctx.mount.querySelector('#wordChainInput')?.value||'');});
  }

  function moveTTT(s,idx){const b=[...(s.state.board||[])],seat=mySeat(s);if(b[idx]!==null)return;b[idx]=seat;if(tttWin(b,seat))return submitState(s,{board:b},null,'finished',[uid()]);if(b.every(v=>v!==null))return submitState(s,{board:b},null,'finished',[]);submitState(s,{board:b},nextPlayer(s));}
  function moveConnect(s,col){const b=[...(s.state.board||[])],seat=mySeat(s);let idx=-1;for(let r=5;r>=0;r--){const i=r*7+col;if(b[i]===null){idx=i;break;}}if(idx<0)return;b[idx]=seat;if(connectWin(b,seat))return submitState(s,{board:b},null,'finished',[uid()]);if(b.every(v=>v!==null))return submitState(s,{board:b},null,'finished',[]);submitState(s,{board:b},nextPlayer(s));}
  function moveGomoku(s,idx){const b=[...(s.state.board||[])],seat=mySeat(s);if(b[idx]!==null)return;b[idx]=seat;if(gomokuWin(b,seat,idx))return submitState(s,{board:b},null,'finished',[uid()]);if(b.every(v=>v!==null))return submitState(s,{board:b},null,'finished',[]);submitState(s,{board:b},nextPlayer(s));}
  function moveReversi(s,idx){const b=[...(s.state.board||[])],seat=mySeat(s),flips=revFlips(b,seat,idx);if(!flips.length)return;b[idx]=seat;flips.forEach(i=>b[i]=seat);const other=1-seat;const otherLegal=revLegal(b,other),mine=revLegal(b,seat);if(!otherLegal.length&&!mine.length){const c0=b.filter(x=>x===0).length,c1=b.filter(x=>x===1).length,w=c0===c1?[]:[s.player_ids[c0>c1?0:1]];return submitState(s,{board:b},null,'finished',w);}const next=otherLegal.length?s.player_ids[other]:uid();submitState(s,{board:b},next);}
  function moveMancala(s,pit){const p=[...(s.state.pits||[])],seat=mySeat(s);if(!p[pit])return;const own=seat===0?(pit>=0&&pit<=5):(pit>=7&&pit<=12);if(!own)return;let stones=p[pit];p[pit]=0;let i=pit;while(stones){i=(i+1)%14;if((seat===0&&i===13)||(seat===1&&i===6))continue;p[i]++;stones--;}
    const ownStore=seat===0?6:13;const ownRange=seat===0?[0,5]:[7,12];if(i!==ownStore&&i>=ownRange[0]&&i<=ownRange[1]&&p[i]===1){const opp=12-i;if(p[opp]>0){p[ownStore]+=p[opp]+1;p[opp]=0;p[i]=0;}}
    const side0=p.slice(0,6).reduce((a,b)=>a+b,0),side1=p.slice(7,13).reduce((a,b)=>a+b,0);if(side0===0||side1===0){p[6]+=side0;p[13]+=side1;for(let k=0;k<6;k++)p[k]=0;for(let k=7;k<13;k++)p[k]=0;const w=p[6]===p[13]?[]:[s.player_ids[p[6]>p[13]?0:1]];return submitState(s,{pits:p},null,'finished',w);}submitState(s,{pits:p},i===ownStore?uid():nextPlayer(s));}
  function completedBox(h,v,r,c){return h[r*4+c]!==null&&h[(r+1)*4+c]!==null&&v[r*5+c]!==null&&v[r*5+c+1]!==null;}
  function moveDots(s,kind,idx){const st={h:[...(s.state.h||[])],v:[...(s.state.v||[])],boxes:[...(s.state.boxes||[])]},seat=mySeat(s);if(st[kind][idx]!==null)return;st[kind][idx]=seat;let gained=0;for(let r=0;r<4;r++)for(let c=0;c<4;c++){const bi=r*4+c;if(st.boxes[bi]===null&&completedBox(st.h,st.v,r,c)){st.boxes[bi]=seat;gained++;}}
    if(st.boxes.every(x=>x!==null)){const scores=s.player_ids.map((_,i)=>st.boxes.filter(x=>x===i).length),mx=Math.max(...scores),w=s.player_ids.filter((_,i)=>scores[i]===mx);return submitState(s,st,null,'finished',w);}submitState(s,st,gained?uid():nextPlayer(s));}
  function neighbors(i){const r=Math.floor(i/9),c=i%9,out=[];if(r>0)out.push(i-9);if(r<8)out.push(i+9);if(c>0)out.push(i-1);if(c<8)out.push(i+1);return out;}
  function moveFiller(s,color){const st={colors:[...(s.state.colors||[])],owners:[...(s.state.owners||[])],current:[...(s.state.current||[])]},seat=mySeat(s);if(st.current.includes(color))return;st.current[seat]=color;const q=[];st.owners.forEach((o,i)=>{if(o===seat){st.colors[i]=color;q.push(i);}});const seen=new Set(q);while(q.length){const i=q.shift();for(const n of neighbors(i)){if(seen.has(n)||st.owners[n]!==null)continue;if(st.colors[n]===color){st.owners[n]=seat;seen.add(n);q.push(n);}}}
    if(st.owners.every(x=>x!==null)){const scores=s.player_ids.map((_,i)=>st.owners.filter(x=>x===i).length),mx=Math.max(...scores),w=s.player_ids.filter((_,i)=>scores[i]===mx);return submitState(s,st,null,'finished',w);}submitState(s,st,nextPlayer(s));}
  function moveWordChain(s,raw){const word=String(raw||'').trim().toLowerCase();const words=[...(s.state.words||[])];if(!/^[a-z][a-z'-]{1,31}$/.test(word))return showToast('Use a word with at least 2 letters.','error');if(words.includes(word))return showToast('That word was already used.','error');const last=words.at(-1);if(last&&word[0]!==last.slice(-1))return showToast(`Your word must start with ${last.slice(-1).toUpperCase()}.`,'error');words.push(word);submitState(s,{words},nextPlayer(s));}


  /* ---------- Chess ---------- */
  const CHESS_GLYPH={K:"♔",Q:"♕",R:"♖",B:"♗",N:"♘",P:"♙",k:"♚",q:"♛",r:"♜",b:"♝",n:"♞",p:"♟",".":""};
  const C_DIRS={n:[-33,-31,-18,-14,14,18,31,33],b:[-17,-15,15,17],r:[-16,-1,1,16],k:[-17,-16,-15,-1,1,15,16,17]};
  const cOn=i=>i>=0&&i<128&&!(i&0x88);
  const cSide=p=>!p||p==="."?0:p===p.toUpperCase()?1:-1;
  const cSq=i=>"abcdefgh"[i&7]+(8-(i>>4));
  const cIndex=s=>(8-Number(s[1]))*16+"abcdefgh".indexOf(s[0]);
  function cParseFen(fen){const f=fen.trim().split(/\s+/),rows=f[0].split('/'),b=Array(128).fill('.');rows.forEach((row,r)=>{let c=0;for(const p of row){if(/^[1-8]$/.test(p))c+=+p;else b[r*16+c++]=p;}});return{b,t:f[1]==='w'?1:-1,c:(f[2].includes('K')?1:0)|(f[2].includes('Q')?2:0)|(f[2].includes('k')?4:0)|(f[2].includes('q')?8:0),ep:f[3]==='-'?-1:cIndex(f[3]),half:+(f[4]||0),full:+(f[5]||1)};}
  function cFen(s){let rows=[];for(let r=0;r<8;r++){let row='',empty=0;for(let c=0;c<8;c++){const p=s.b[r*16+c];if(p==='.')empty++;else{if(empty){row+=empty;empty=0;}row+=p;}}if(empty)row+=empty;rows.push(row);}const rights=(s.c&1?'K':'')+(s.c&2?'Q':'')+(s.c&4?'k':'')+(s.c&8?'q':'')||'-';return `${rows.join('/')} ${s.t===1?'w':'b'} ${rights} ${s.ep<0?'-':cSq(s.ep)} ${s.half} ${s.full}`;}
  function cAttacked(s,target,by){for(let f=0;f<128;f++){if(!cOn(f)||cSide(s.b[f])!==by)continue;const p=s.b[f].toLowerCase();if(p==='p'){if(target===f-16*by-1||target===f-16*by+1)return true;continue;}for(const d of(C_DIRS[p]||C_DIRS.k)){for(let t=f+d;cOn(t);t+=d){if(t===target)return true;if(s.b[t]!=='.'||p==='n'||p==='k')break;}}}return false;}
  const cChecked=(s,color=s.t)=>cAttacked(s,s.b.indexOf(color===1?'K':'k'),-color);
  function cApply(s,m){const[f,t,promo,flag]=m,b=s.b.slice(),piece=b[f],captured=b[t];let c=s.c;b[f]='.';b[t]=promo?(s.t===1?promo.toUpperCase():promo):piece;if(flag==='ep')b[t+16*s.t]='.';if(flag==='castle'){const rf=t>f?f+3:f-4,rt=t>f?f+1:f-1;b[rt]=b[rf];b[rf]='.';}if(piece==='K')c&=~3;if(piece==='k')c&=~12;const rb={119:1,112:2,7:4,0:8};if(piece.toLowerCase()==='r')c&=~(rb[f]||0);if(captured.toLowerCase()==='r')c&=~(rb[t]||0);return{b,t:-s.t,c,ep:piece.toLowerCase()==='p'&&Math.abs(t-f)===32?(t+f)/2:-1,half:piece.toLowerCase()==='p'||captured!=='.'||flag==='ep'?0:s.half+1,full:s.full+(s.t===-1?1:0)};}
  function cPseudo(s){const out=[];for(let f=0;f<128;f++){if(!cOn(f)||cSide(s.b[f])!==s.t)continue;const p=s.b[f].toLowerCase();const add=(t,flag='')=>{if(s.b[t].toLowerCase()==='k')return;if(p==='p'&&(t>>4===0||t>>4===7))for(const q of['q','r','b','n'])out.push([f,t,q,flag]);else out.push([f,t,'',flag]);};if(p==='p'){const t=f-16*s.t;if(cOn(t)&&s.b[t]==='.'){add(t);const u=t-16*s.t;if(f>>4===(s.t===1?6:1)&&s.b[u]==='.')add(u);}for(const d of[-1,1]){const u=t+d;if(!cOn(u))continue;if(cSide(s.b[u])===-s.t)add(u);else if(u===s.ep&&s.b[u]==='.'&&s.b[u+16*s.t]===(s.t===1?'p':'P'))add(u,'ep');}}else{for(const d of(C_DIRS[p]||C_DIRS.k))for(let t=f+d;cOn(t);t+=d){if(cSide(s.b[t])===s.t)break;add(t);if(s.b[t]!=='.'||p==='n'||p==='k')break;}const home=s.t===1?116:4,rook=s.t===1?'R':'r',bits=s.t===1?[1,2]:[4,8];if(p==='k'&&f===home&&!cChecked(s)){if((s.c&bits[0])&&s.b[f+3]===rook&&s.b[f+1]==='.'&&s.b[f+2]==='.'&&!cAttacked(s,f+1,-s.t)&&!cAttacked(s,f+2,-s.t))add(f+2,'castle');if((s.c&bits[1])&&s.b[f-4]===rook&&s.b[f-1]==='.'&&s.b[f-2]==='.'&&s.b[f-3]==='.'&&!cAttacked(s,f-1,-s.t)&&!cAttacked(s,f-2,-s.t))add(f-2,'castle');}}}return out;}
  const cLegal=s=>cPseudo(s).filter(m=>!cChecked(cApply(s,m),s.t));
  function chessHTML(s){const cs=cParseFen(s.state?.fen||"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1"),seat=mySeat(s),mySide=seat===0?1:-1,sel=chessSelection.get(s.id),legal=(canMove(s)&&cs.t===mySide)?cLegal(cs):[],targets=new Set(legal.filter(m=>m[0]===sel).map(m=>m[1]));let cells='';for(let r=0;r<8;r++)for(let c=0;c<8;c++){const i=r*16+c,p=cs.b[i],selected=i===sel,target=targets.has(i);cells+=`<button class="chess-square ${(r+c)%2?'dark':'light'} ${selected?'selected':''} ${target?'target':''}" data-chess="${i}" ${!canMove(s)?'disabled':''}><span>${CHESS_GLYPH[p]}</span></button>`;}return `<div class="chess-board">${cells}</div><p class="game-message">${cChecked(cs)?'check · ':''}${cs.t===1?'white':'black'} to move</p>`;}
  function moveChessClick(s,idx){if(!canMove(s))return;const cs=cParseFen(s.state.fen),seat=mySeat(s),mySide=seat===0?1:-1;if(cs.t!==mySide)return;const legal=cLegal(cs),sel=chessSelection.get(s.id);if(cSide(cs.b[idx])===mySide){chessSelection.set(s.id,idx);render();wire();return;}if(sel===undefined)return;let choices=legal.filter(m=>m[0]===sel&&m[1]===idx);if(!choices.length){chessSelection.delete(s.id);render();wire();return;}let move=choices[0];if(choices.length>1){let q=(prompt('Promote to q, r, b, or n','q')||'q').toLowerCase();move=choices.find(m=>m[2]===q)||choices.find(m=>m[2]==='q')||choices[0];}const next=cApply(cs,move);chessSelection.delete(s.id);const lm=cLegal(next);if(!lm.length){if(cChecked(next))return submitState(s,{fen:cFen(next),last:[sel,idx]},null,'finished',[uid()]);return submitState(s,{fen:cFen(next),last:[sel,idx]},null,'finished',[]);}submitState(s,{fen:cFen(next),last:[sel,idx]},nextPlayer(s));}

  /* ---------- Checkers ---------- */
  function initCheckers(){const b=Array(64).fill(0);for(let r=0;r<3;r++)for(let c=0;c<8;c++)if((r+c)%2)b[r*8+c]=-1;for(let r=5;r<8;r++)for(let c=0;c<8;c++)if((r+c)%2)b[r*8+c]=1;return{board:b,mustFrom:null};}
  function checkDirs(piece){return Math.abs(piece)===2?[[-1,-1],[-1,1],[1,-1],[1,1]]:piece>0?[[-1,-1],[-1,1]]:[[1,-1],[1,1]];}
  function checkMoves(board,seat,onlyFrom=null){const sign=seat===0?1:-1,out=[],caps=[];for(let i=0;i<64;i++){if((board[i]||0)*sign<=0||onlyFrom!==null&&i!==onlyFrom)continue;const r=Math.floor(i/8),c=i%8;for(const[dr,dc]of checkDirs(board[i])){const r1=r+dr,c1=c+dc,r2=r+2*dr,c2=c+2*dc;if(r1>=0&&r1<8&&c1>=0&&c1<8){const j=r1*8+c1;if(board[j]===0)out.push({from:i,to:j,cap:null});else if(board[j]*sign<0&&r2>=0&&r2<8&&c2>=0&&c2<8&&board[r2*8+c2]===0)caps.push({from:i,to:r2*8+c2,cap:j});}}}return caps.length?caps:out;}
  function checkersHTML(s){const b=s.state?.board||[],seat=mySeat(s),sel=checkersSelection.get(s.id),moves=canMove(s)?checkMoves(b,seat,s.state?.mustFrom??null):[],targets=new Set(moves.filter(m=>m.from===sel).map(m=>m.to));return `<div class="checkers-board">${b.map((p,i)=>`<button class="checker-square ${(Math.floor(i/8)+i%8)%2?'dark':'light'} ${i===sel?'selected':''} ${targets.has(i)?'target':''}" data-checkers="${i}" ${!canMove(s)?'disabled':''}>${p?`<span class="checker-piece ${p>0?'red':'black'} ${Math.abs(p)===2?'king':''}">${Math.abs(p)===2?'★':''}</span>`:''}</button>`).join('')}</div>`;}
  function moveCheckersClick(s,idx){if(!canMove(s))return;const b=[...(s.state.board||[])],seat=mySeat(s),sign=seat===0?1:-1,must=s.state?.mustFrom??null,moves=checkMoves(b,seat,must),sel=checkersSelection.get(s.id);if(b[idx]*sign>0&&(must===null||idx===must)){checkersSelection.set(s.id,idx);render();wire();return;}if(sel===undefined)return;const m=moves.find(x=>x.from===sel&&x.to===idx);if(!m)return;let piece=b[m.from];b[m.from]=0;b[m.to]=piece;if(m.cap!==null)b[m.cap]=0;const row=Math.floor(m.to/8);if(piece===1&&row===0)b[m.to]=2;if(piece===-1&&row===7)b[m.to]=-2;checkersSelection.delete(s.id);if(m.cap!==null){const more=checkMoves(b,seat,m.to).filter(x=>x.cap!==null);if(more.length){checkersSelection.set(s.id,m.to);return submitState(s,{board:b,mustFrom:m.to},uid());}}const other=1-seat,otherMoves=checkMoves(b,other);if(!otherMoves.length||!b.some(x=>x*(other===0?1:-1)>0))return submitState(s,{board:b,mustFrom:null},null,'finished',[uid()]);submitState(s,{board:b,mustFrom:null},nextPlayer(s));}

  /* ---------- Anagrams ---------- */
  function scrambleWord(word,seed){let a=word.split('');let x=seed||1;for(let i=a.length-1;i>0;i--){x=(x*1664525+1013904223)>>>0;const j=x%(i+1);[a[i],a[j]]=[a[j],a[i]];}const out=a.join('');return out===word?word.slice(1)+word[0]:out;}
  function puzzleFor(round){const answer=WORD_BANK[round%WORD_BANK.length];return{answer,scramble:scrambleWord(answer,round*97+31)};}
  function initAnagrams(n){return{round:0,puzzle:puzzleFor(0),scores:Array(n).fill(0),attempts:0,last:null};}
  function anagramsHTML(s){const st=s.state||{},scores=st.scores||[];return `<div class="anagram-game"><div class="scramble-word">${esc((st.puzzle?.scramble||'').toUpperCase())}</div><div class="score-strip">${s.player_ids.map((id,i)=>`<span>${esc(nameOf(id))} <b>${scores[i]||0}</b></span>`).join('')}</div>${canMove(s)?`<form id="anagramForm" class="word-input-row"><input id="anagramInput" maxlength="24" autocomplete="off" placeholder="unscramble it"/><button class="btn primary" type="submit">guess</button></form>`:''}<p class="hint-text">first to 5 points wins · a new word appears after a correct guess or everyone misses</p></div>`;}
  function moveAnagram(s,raw){const st=structuredClone(s.state||{}),seat=mySeat(s),guess=String(raw||'').trim().toLowerCase();if(!guess)return;const correct=guess===st.puzzle.answer;st.last={seat,guess,correct};if(correct){st.scores[seat]=(st.scores[seat]||0)+1;if(st.scores[seat]>=5)return submitState(s,st,null,'finished',[uid()]);st.round=(st.round||0)+1;st.puzzle=puzzleFor(st.round);st.attempts=0;}else{st.attempts=(st.attempts||0)+1;if(st.attempts>=s.player_ids.length){st.round=(st.round||0)+1;st.puzzle=puzzleFor(st.round);st.attempts=0;}}submitState(s,st,nextPlayer(s));}

  /* ---------- Skill meter games ---------- */
  function skillValue(){const el=ctx?.mount?.querySelector('.skill-cursor');if(el?.parentElement){const cs=getComputedStyle(el),left=parseFloat(cs.left)||0,span=Math.max(1,el.parentElement.clientWidth-el.offsetWidth);return Math.max(0,Math.min(1,left/span));}const t=(performance.now()%3000)/3000;return t<.5?t*2:(1-t)*2;}
  function meterHTML(label='tap when the marker is centered'){return `<div class="skill-wrap"><div class="skill-meter"><span class="skill-zone"></span><span class="skill-cursor"></span></div><p class="hint-text">${esc(label)}</p></div>`;}
  function initScoreGame(n,shots){return{scores:Array(n).fill(0),shots:Array(n).fill(0),maxShots:shots,last:null};}
  function scoreSummary(s,low=false){const st=s.state||{};return `<div class="score-strip">${s.player_ids.map((id,i)=>`<span>${esc(nameOf(id))} <b>${st.scores?.[i]||0}${low?' strokes':''}</b></span>`).join('')}</div>`;}
  function skillScoreHTML(s,type){const copy={darts:'throw dart',archery:'release arrow',basketball:'shoot',shuffleboard:'slide'}[type]||'shoot';const st=s.state||{},seat=mySeat(s);return `<div class="skill-game"><div class="skill-visual ${type}"><span>${def(type).icon}</span></div>${scoreSummary(s)}${meterHTML()}${canMove(s)?`<button id="skillShoot" class="btn primary big-game-button" type="button">${copy}</button>`:''}<p class="game-message">${esc(nameOf(s.turn_user_id))} · ${st.shots?.[seat]||0}/${st.maxShots||0} attempts used</p></div>`;}
  function moveSkillScore(s,type){if(!canMove(s))return;const st=structuredClone(s.state||{}),seat=mySeat(s),v=skillValue(),d=Math.abs(v-.5);let pts=0;if(type==='darts')pts=d<.035?60:d<.08?50:d<.15?40:d<.23?25:d<.34?10:0;else if(type==='archery')pts=Math.max(0,10-Math.floor(d*22));else if(type==='basketball'){const attempt=st.shots[seat]||0;const worth=attempt>=8?3:2;pts=d<.19?worth:0;}else if(type==='shuffleboard')pts=d<.06?4:d<.13?3:d<.22?2:d<.32?1:0;st.scores[seat]=(st.scores[seat]||0)+pts;st.shots[seat]=(st.shots[seat]||0)+1;st.last={seat,pts};if(st.shots.every(x=>x>=st.maxShots)){const mx=Math.max(...st.scores),w=s.player_ids.filter((_,i)=>st.scores[i]===mx);return submitState(s,st,null,'finished',w);}submitState(s,st,nextPlayer(s));}
  function miniGolfHTML(s){const st=s.state||{};return `<div class="skill-game"><div class="golf-hole"><span class="golf-flag">🚩</span><span class="golf-ball">●</span></div><h3>hole ${st.hole||1} / 5</h3>${scoreSummary(s,true)}${meterHTML('center = clean line to the cup')}${canMove(s)?`<button id="golfShoot" class="btn primary big-game-button" type="button">putt</button>`:''}</div>`;}
  function moveMiniGolf(s){if(!canMove(s))return;const st=structuredClone(s.state||{}),seat=mySeat(s),d=Math.abs(skillValue()-.5),strokes=d<.055?1:d<.13?2:d<.22?3:d<.32?4:5;st.scores[seat]=(st.scores[seat]||0)+strokes;st.shots[seat]=(st.shots[seat]||0)+1;st.last={seat,strokes};const allDone=st.shots.every(x=>x>=st.hole);if(allDone){if(st.hole>=5){const mn=Math.min(...st.scores),w=s.player_ids.filter((_,i)=>st.scores[i]===mn);return submitState(s,st,null,'finished',w);}st.hole++;}submitState(s,st,nextPlayer(s));}

  /* ---------- Cup Pong ---------- */
  function cupPongHTML(s){const st=s.state||{},seat=mySeat(s),target=1-seat;return `<div class="pong-game"><div class="cup-side"><h4>${esc(nameOf(s.player_ids[target]))}'s cups</h4><div class="cup-rack">${(st.cups?.[target]||[]).map((alive,i)=>`<button class="pong-cup ${alive?'alive':'sunk'}" data-cup="${i}" ${!canMove(s)||!alive?'disabled':''}>${alive?'🥤':'·'}</button>`).join('')}</div></div>${meterHTML('tap a cup when the marker crosses the center')}</div>`;}
  function moveCupPong(s,cup){if(!canMove(s))return;const st=structuredClone(s.state||{}),seat=mySeat(s),target=1-seat;if(!st.cups[target][cup])return;const hit=Math.abs(skillValue()-.5)<.17;st.last={seat,cup,hit};if(hit)st.cups[target][cup]=false;if(st.cups[target].every(x=>!x))return submitState(s,st,null,'finished',[uid()]);submitState(s,st,nextPlayer(s));}

  /* ---------- 8-Ball ---------- */
  const POOL_POS={1:[25,32],2:[38,26],3:[38,38],4:[51,20],5:[51,32],6:[51,44],7:[64,14],8:[64,26],9:[64,38],10:[64,50],11:[77,20],12:[77,32],13:[77,44],14:[90,26],15:[90,38]};
  function poolHTML(s){const st=s.state||{},seat=mySeat(s),group=seat===0?[1,2,3,4,5,6,7]:[9,10,11,12,13,14,15],left=group.filter(n=>!(st.pocketed||[]).includes(n)),targets=left.length?left:[8];return `<div class="pool-game"><div class="pool-table">${[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].filter(n=>!(st.pocketed||[]).includes(n)).map(n=>`<span class="pool-ball ball-${n===8?'eight':n<=7?'solid':'stripe'}" style="left:${POOL_POS[n][0]}%;top:${POOL_POS[n][1]}%">${n}</span>`).join('')}<span class="pool-cue">●</span></div><div class="pool-legend"><span>${esc(nameOf(s.player_ids[0]))}: solids</span><span>${esc(nameOf(s.player_ids[1]))}: stripes</span></div>${meterHTML('choose a legal ball, then shoot near center')}${canMove(s)?`<div class="pool-controls"><select id="poolTarget">${targets.map(n=>`<option value="${n}">${n===8?'8-ball':`ball ${n}`}</option>`).join('')}</select><button id="poolShoot" class="btn primary" type="button">shoot</button></div>`:''}</div>`;}
  function movePool(s){if(!canMove(s))return;const st=structuredClone(s.state||{}),seat=mySeat(s),target=+(ctx.mount.querySelector('#poolTarget')?.value||0);if(!target)return;const threshold=target===8?.105:.16,hit=Math.abs(skillValue()-.5)<threshold;st.last={seat,target,hit};if(hit){st.pocketed=[...(st.pocketed||[]),target];if(target===8)return submitState(s,st,null,'finished',[uid()]);return submitState(s,st,uid());}submitState(s,st,nextPlayer(s));}
  function pool9HTML(s){const st=s.state||{},next=[1,2,3,4,5,6,7,8,9].find(n=>!(st.pocketed||[]).includes(n))||9;return `<div class="pool-game"><div class="pool-table">${[1,2,3,4,5,6,7,8,9].filter(n=>!(st.pocketed||[]).includes(n)).map(n=>`<span class="pool-ball ${n===8?'ball-eight':n<=7?'ball-solid':'ball-stripe'}" style="left:${POOL_POS[n][0]}%;top:${POOL_POS[n][1]}%">${n}</span>`).join('')}<span class="pool-cue">●</span></div><p class="game-message">legal target: ball ${next}</p>${meterHTML('sink the lowest-numbered ball; the 9 wins the rack')}${canMove(s)?`<button id="pool9Shoot" class="btn primary" type="button">shoot ball ${next}</button>`:''}</div>`;}
  function movePool9(s){if(!canMove(s))return;const st=structuredClone(s.state||{}),seat=mySeat(s),target=[1,2,3,4,5,6,7,8,9].find(n=>!(st.pocketed||[]).includes(n));if(!target)return;const hit=Math.abs(skillValue()-.5)<(target===9?.105:.16);st.last={seat,target,hit};if(hit){st.pocketed=[...(st.pocketed||[]),target];if(target===9)return submitState(s,st,null,'finished',[uid()]);return submitState(s,st,uid());}submitState(s,st,nextPlayer(s));}

  window.StasisGames = { mount, stop, defs:GAME_DEFS };
})();
