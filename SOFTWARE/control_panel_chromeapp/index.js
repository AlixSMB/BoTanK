'use strict';

const cam_port = 8081;
const opts_port = 8082;
const coms_port_in = 8083;
const coms_port_out = 8082;

// default dimensions of aruco grid
const ARUCO_GRID_NBW = 8;
const ARUCO_GRID_NBH = 5;
const ARUCO_GRID_CSIZE = 0.014; // cell size in meters
const ARUCO_GRID_CMARGIN = ARUCO_GRID_CSIZE;

let getdom = (str, el=document) => [...el.querySelectorAll(str)];
let uniqueid_gen = function(){
	let tmp = -1;
	return function(){ return ++tmp; }
};
let uniqueids = [uniqueid_gen(), uniqueid_gen(), uniqueid_gen()];
let noop = ()=>{};
let arr_last = arr => arr[arr.length-1];
let obj_get = (obj, keys) => {
	for (let key of keys) obj = obj[key];
	return obj;
};
let obj_set = (obj, keys, val) => {
	for (let key of keys.slice(0,-1)) obj = obj[key];
	obj[arr_last(keys)] = val;
};
let repeat = (n, el) => Array(n).fill(el);

function resetNodesVals(nodes) { nodes.forEach(node => node.value = node.getAttribute('oldvalue')); }
function updateNodesVals(nodes){ nodes.forEach(node => node.setAttribute('oldvalue', node.value)); }

function setNodesVals(nodes, vals){ nodes.forEach((node,ind) => {
	node.value = vals[ind];
	node.setAttribute('oldvalue', vals[ind]);
}); }
let html_inputzone = (n=1, classes="", values=null, attrs=null, sep="<b>;</b>") => {
	let inputs = [...Array(n).keys()].map(ind => 
		`<input 
			type="text" 
			${ attrs === null ? "" : attrs[ind] } 
			${ values === null ? "value='' oldvalue=''" : `value="${values[ind]}" oldvalue="${values[ind]}"` }
			class="in_inputzone ${classes}"
		>`
	);
	if (typeof sep == 'string') inputs = inputs.join(sep);
	else /* array */            inputs = inputs.shift() + inputs.map((str,i) => sep[i]+str);
	
	return `<div class="div_inputzone" style="display:inline;">
			${inputs}<!--
			--><div class="div_inbtnctls" style="display:none;">
				<input type="image" src="res/check.png" class="btn_ok btn">
				<input type="image" src="res/cancel.png" class="btn_cancel btn">
			</div>
		</div>
	`;
};
function set_inputzonebtns_callbacks(on_ok, n, tankdiv, inputtag){
	let inputzone = getdom(inputtag, tankdiv)[0].parentNode;
	
	getdom('.btn_ok', inputzone)[0].addEventListener( 'click', function(){
		let nodes = getdom('input', this.parentNode.parentNode).splice(0, n);
		on_ok(nodes);
		updateNodesVals(nodes);
		this.parentNode.style.display = 'none';
	} );
	getdom('.btn_cancel', inputzone)[0].addEventListener( 'click', function(){
		resetNodesVals( getdom('input', this.parentNode.parentNode).splice(0, n) );
		this.parentNode.style.display = 'none';
	} );
}
function set_inputzone_callback(el){ getdom('.in_inputzone', el).forEach(node => node.addEventListener( 'input', function(){getdom('div', this.parentNode)[0].style.display = 'inline';} )); }

let html_radiozone = (name, values, checked=0, zoneattr='', attrs=null) => {
	let radios = [...Array(values.length).keys()].map(ind => 
		`<input 
			type="radio" name="${name}" value="${values[ind]}"
			${ attrs === null ? "" : attrs[ind] } 
			${ checked == ind ? "checked" : "" } 
		>${values[ind]}`
	).join(' ');
	
	return `<div class="div_radiozone" style="display:inline;" oldvalue="${values[checked]}" ${zoneattr}>${radios}</div>`;
};
function set_radiozone_callbacks(on_click, tankdiv, radioname){
	getdom(`input[type="radio"][name="${radioname}"]`, tankdiv).forEach(radio => radio.addEventListener( 'change', 
		function(){ if (this.checked) on_click(this.parentNode, this.value); }
	));
}
function update_radiozone(nodezone){ nodezone.setAttribute( 'oldvalue', getdom('input[checked]', nodezone)[0].value ); }
function revert_radiozone(nodezone){ getdom(`input`, nodezone).find(node => node.value == nodezone.getAttribute('oldvalue')).checked = true; }

let msgconsole = getdom('#div_msg')[0];
function dispmsgGamepad(ind, msg){
	msgconsole.innerHTML += `<br>GAMEPAD&lt;${ind}&gt; <b>::</b> ${msg}`;
}

let canvas = getdom('canvas')[0];
let canvasW = canvas.width; let canvasH = canvas.height;
let ctx = canvas.getContext('2d');
ctx.scale(1, -1);           // set y axis pointing up
ctx.translate(canvasW/2, -canvasH/2); // origin at bottom left

let BASE_MIN = 5; // min canavs size in meters
let mPERpx = BASE_MIN/Math.min(canvasW, canvasH);
ctx.scale(1/mPERpx, 1/mPERpx);

// [!] loops should be deleted/re-created after being stopped [!]
class Loop{
	constructor(fun, on_stop=noop, types=[], delay=0, harddelay=0, on_stophard=noop){
		this.id = uniqueids[1]();
		this.types = types;
		
		this.fun = fun;
		this.delay = delay;
		this.harddelay = harddelay;
		this.on_stop = on_stop;
		this.on_stophard = on_stophard;
		
		this.stopped = true;
		this.indelay = false;
		this.infun   = false;
	}
	
	addToPool(pool){
		this.types.forEach(type => {
			if (! (type in pool)) pool[type] = {};
			pool[type][this.id] = this;
		});
		pool.ids[this.id] = this;
		return this;
	}
	delFromPool(pool){
		this.types.forEach(type => delete pool[type][this.id]);
		delete pool.ids[this.id];
		return this;
	}
	
	start(){
		this.stopped = false;
		this.indelay = false;
		this.infun  = false;
		this.rec();
	}
	stop(){
		if (this.stopped) return this;
		
		this.on_stop();
		this.stopped = true;
		return this;
	}
	hardstop(){ // max allowed timeout reached
		if (this.stopped) return;
		this.on_stophard();
		this.stopped = true;
	}
	rec(){
		if (!this.stopped && !this.infun && !this.indelay){
			
			let hardtimeout = null;
			if (this.delay != 0){
				this.indelay = true;
				
				if (this.harddelay != 0) hardtimeout = window.setTimeout( this.hardstop.bind(this), this.harddelay );
				
				window.setTimeout( ()=>{
					this.indelay = false;
					this.rec();
				}, this.delay );
			}
			
			this.infun = true;
			this.fun( ()=>{
				this.infun = false;
				if (hardtimeout !== null) window.clearTimeout(hardtimeout);
				this.rec();
			} );
		}
	}
}

// see: developer.chrome.com/docs/extensions/reference/sockets_udp
let udp_streams = {}; // in udp streams
chrome.sockets.udp.onReceive.addListener( info => {
	//console.log(`Message from socket id "${info.socketId}" @${info.remoteAddress}:${info.remotePort}`);
	if (info.socketId in udp_streams) udp_streams[info.socketId].on_recv(info.data);
} );
class UDPStream{
	constructor(addr, port_in=null, port_out=null, on_recv=noop){
		this.port_in = port_in;
		this.port_out = port_out;
		this.on_recv = on_recv;
		this.on = false;
		this.setAddr(addr);
	}
	init(params={}){
		if (this.on) return;
		
		chrome.sockets.udp.create(params, sockinfo => {
			this.sockid = sockinfo.socketId;
			
			if (this.port_in == null){ // don't bind, we won't receive data, only send
				this.on = true;
				udp_streams[this.sockid] = this;
			}
			
			else chrome.sockets.udp.bind(this.sockid, '0.0.0.0', this.port_in, res => {
				if (res < 0){
					chrome.sockets.udp.close(this.sockid);
					console.log("Error binding udp socket");
				}
				else{
					this.on = true;
					udp_streams[this.sockid] = this;
				}
			});
		});
	}
	send(data, callback, on_err){
		chrome.sockets.udp.send(this.sockid, data, this.addr, this.port_out, info => {
			if (info.resultCode < 0){
				console.log("UDPStream send error");
				on_err();
			}
			else callback();
		})
	}
	setAddr(addr){
		this.close();
		this.addr = addr;
		return this;
	}
	close(){
		if (!this.on) return;
		chrome.sockets.udp.close(this.sockid);
		delete udp_streams[this.sockid];
		this.on = false;
	}
}
// see: developer.chrome.com/docs/extensions/reference/sockets_tcp
let tcp_streams = {}; // in tcp streams
chrome.sockets.tcp.onReceive.addListener( info => {
	if (info.socketId in tcp_streams) tcp_streams[info.socketId].on_recv(info.data);
} );
class TCPClient{
	constructor(addr, port, on_recv=noop){
		this.port = port;
		this.addr = addr;
		this.on_recv = on_recv;
		this.on = false;
		this.setAddr(addr);
	}
	init(on_con=noop, on_err=noop){
		if (this.on) return;
		
		chrome.sockets.tcp.create({}, sockinfo => {
			this.sockid = sockinfo.socketId;
			chrome.sockets.tcp.connect(this.sockid, this.addr, this.port, res => {
				if (res < 0){
					chrome.sockets.tcp.close(this.sockid);
					console.log("Error connecting to tcp socket");
					on_err();
				}
				else{
					this.on = true;
					tcp_streams[this.sockid] = this;
					on_con();
				}
			});
		});
	}
	send(data, callback, on_err){
		chrome.sockets.tcp.send(this.sockid, data, info => {
			if (info.resultCode < 0){
				console.log("TCPClient send error");
				on_err();
			}
			else callback();
		})
	}
	setAddr(addr){
		this.close();
		this.addr = addr;
		return this;
	}
	close(){
		if (!this.on) return;
		chrome.sockets.tcp.close(this.sockid);
		delete tcp_streams[this.sockid];
		this.on = false;
	}
}

let tanks = [];
class Tank{
	static colors = ['red', 'green', 'blue', 'orange', 'purple'];
	
	constructor(addr="127.0.0.1", color=null){
		this.data = {
			move: {
				com: { // command
					pos: [0, 0], // x, y
					dir: [0, 0],
					vel: [0, 0]
				},
				real: { // actual value
					pos: [0, 0], 
					dir: [0, 0],
					vel: [0, 0]
				},
				auto: { // automatic mode
					on: false,
					target: [0, 0]
				}
			},
			cannon: {
				com: {
					yaw: 0,
					pitch: 0
				},
				real: {
					yaw: 0,
					pitch: 0
				},
				auto: {on: false}
			},
			markers: {
				type: 'auto',
				corners: [],
				ids: []
			}
		};
		
		this.id = uniqueids[0]();
		this.loops = {ids: {}, coms:{}};
		
		this.addr = addr;
		this.neterr = true;
		
		this.cam = { // in UDP stream
			reader: new FileReader(),
			img: null,
			on: true,
			stream: new UDPStream(addr, cam_port, null, data =>{
				if (this.cam.reader.readyState != 1 /*LOADING*/) this.cam.reader.readAsDataURL(new Blob([data]));
			})
		};
		this.cam.reader.onloadend = () => this.cam.img.src = this.cam.reader.result;
		
		this.coms = {
			move: { // in/out UDP stream
				stream: new UDPStream(addr, coms_port_in, coms_port_out, this.getMoveData.bind(this)),
				out_loop: null
			},
			opts: { // in/out TCP stream
				stream: new TCPClient(addr, opts_port, this.getOptsResp.bind(this)),
				heartbeat_loop: null,
				handlers: [] // handlers for tcp server responses, FIFO
			}
		};
		
		this.gamepad = {
			on: false,
			ind: this.id,
			obj: null,
		};
		
		this.color = color === null ? Tank.colors[ Tank.colors.length % (this.id+1) ] : color;
		this.path = new Path2D();
		let base = 0.2; let height = 0.4; // in m
		this.path.moveTo(-base/2,0);
		this.path.lineTo(base/2, 0);
		this.path.lineTo(0, height);
		this.path.closePath();
		
		this.pickerUrl = `data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" height="24" width="24"><path style="fill:${this.color};" d="M5 21V4h9l.4 2H20v10h-7l-.4-2H7v7Zm7.5-11Zm2.15 4H18V8h-5.25l-.4-2H7v6h7.25Z"/></svg>`;
		this.pickerImg = new Image();
		this.pickerImg.src = this.pickerUrl;
	}
	
	stopLoop(loop){
		if (loop == null) return;
		loop.stop();
		loop.delFromPool(this.loops);
	}
	
	initCamStream(){
		this.cam.img = getdom(`img[tankid="${this.id}"]`)[0];
		this.cam.stream.init({bufferSize:4096*10}); // [!] If the recv buffer is too small, the packets are silently dropped [!]
		this.cam.img.style.display = 'block';
	}
	closeCamStream(){
		this.cam.stream.close();
		if (this.cam.img != null) this.cam.img.style.display = 'none';
	}
	
	stopComsLoops(){
		for (let key in this.loops.coms) this.stopLoop(this.loops.coms[key]);
	}
	regenMoveDataLoop(){
		this.stopLoop(this.coms.move.out_loop);
		this.coms.move.out_loop = new Loop(this.setMoveData.bind(this), noop, ['coms', 'out_move'], 1000/10).addToPool(this.loops); // 10 FPS
	}
	regenHeartbeatLoop(){
		this.stopLoop(this.coms.opts.heartbeat_loop);
		this.coms.opts.heartbeat_loop = new Loop(
			this.sendOptsHeartbeat.bind(this), noop, ['coms', 'out_hbt'], 500, 1500, this.toggleNeterror.bind(this, true) // heartbeat every 1/2s, error if no answer after 1.5s
		).addToPool(this.loops);
	}
	regenComsLoops(){
		this.regenMoveDataLoop();
		this.regenHeartbeatLoop();
	}
	initComs(on_con){
		this.regenComsLoops();
		
		this.coms.move.stream.init();
		this.coms.opts.stream.init( ()=>{
			this.coms.opts.heartbeat_loop.start();
			on_con();
		}, this.toggleNeterror.bind(this, true));
	}
	closeComs(){
		this.stopComsLoops();
		this.coms.move.stream.close();
		this.coms.opts.stream.close();
		this.coms.opts.handlers = [];
	}
	
	toggleNeterror(on){
		if (on){
			this.closeCamStream()
			this.closeComs()
		}
		getdom(`.span_unreachable[tankid="${this.id}"]`)[0].style.display = on ? 'inline' : 'none';
		this.neterr = on;
	}
	
	// parse received move / opts string data 
	parseData(msg){
		for (let line of msg.split('\n')){
			if (line == "") continue;
			
			let [keys, vals] = line.split(';').map( el => el.split(',') );
			
			let obj = obj_get(this.data, keys.slice(0,-1));
			let key = arr_last(keys);
			
			if (vals.length == 1){
				if (key == 'on') obj[key] = vals[0] == '1' ? true : false;
				else             obj[key] = Number(vals[0]);
			}
			else                 obj[key] = vals.map( el => Number(el) );
		}
	}
	// send move / opts string data, handle errors
	sendData(msg, socket, callback=noop){
		socket.send( Uint8Array.from(msg, el => el.charCodeAt()), callback, this.toggleNeterror.bind(this, true) );
	}
	
	// receive opts response from tcp server, split into individual messages
	getOptsResp(resp){
		String.fromCharCode.apply( null, new Uint8Array(resp) ).split('\n\n').forEach( msg => {
			if (msg != '') this.coms.opts.handlers.shift()(msg);
		});
	}
	// send opts request to tcp server
	sendOptsReq(req, callback=noop){
		if (this.neterr) return;
		this.sendData(req, this.coms.opts.stream);
		this.coms.opts.handlers.push(callback);
	}
	sendOptsSET(parts, val){ // send GET request
		let type = typeof val;
		     if (type == 'boolean') this.sendOptsReq(`SET\n${parts.join(',')};${val ? '1' : '0'}\n\n`);
		else if (type == 'number')  this.sendOptsReq(`SET\n${parts.join(',')};${val}\n\n`);
		else /* array */            this.sendOptsReq(`SET\n${parts.join(',')};${val.join(',')}\n\n`);
		
		obj_set(this.data, parts, val);
		this.dispmsg(`"${parts}" set to "${val}"`);
	}
	sendOptsGET(parts){ // send SET request
		this.sendOptsReq(`GET\n${parts.join(',')}\n\n`, this.parseData);
	}
	sendOptsHeartbeat(rec){
		this.sendOptsReq('HEARTBEAT\n\n', rec); // the response msg contents will be ignored, only the fact that a response was sent back is important
	}
	
	// send udp stream of move data (from gamepad or other source) as part of loop
	getMoveData(data){
		this.parseData( String.fromCharCode.apply(null, new Uint8Array(data)) );
	}
	setMoveData(rec){
		this.updateGamepadData();
		// other sources
		// ...
		
		// prepare data
		let msg = '';
		for (let key1 in this.data){
			let part = this.data[key1].com;
			for (let key2 in part){
				let obj = part[key2];
				
				if (typeof obj == 'number') msg += `${key1},com,${key2};${obj}\n`;
				else                        msg += `${key1},com,${key2};${obj.join(',')}\n`;
			}
		}
		this.sendData(msg, this.coms.move.stream, rec);
	}
	setVel0(){
		this.data.move.com.vel = [0,0];
		this.sendData('move,com,vel;0,0\n', this.coms.move.stream);
	}
	toggleMoveAuto(on){
		this.regenMoveDataLoop();
		if (!on) this.coms.move.out_loop.start(); // auto is off, manual is on
		
		this.sendOptsSET(['move', 'auto', 'on'], on);
	}
	
	refresh(){
		this.toggleNeterror(false);
		this.dispmsg('Refreshing connection...');
		
		this.closeCamStream();
		this.closeComs();
		this.cam.stream.setAddr(this.addr);
		this.coms.move.stream.setAddr(this.addr);
		this.coms.opts.stream.setAddr(this.addr);
		
		if (this.cam.on) this.initCamStream();
		this.initComs(()=>{
			// set values
			getdom(`.div_tank[tankid="${this.id}"] .btn_ok`).slice(1).forEach(el => el.click()); // all buttons except first [!] should be tank addr input [!]
			getdom(`.div_tank[tankid="${this.id}"] .div_radiozone input[checked]`).forEach(el => el.click());
		});
		
	}
	setAddr(addr){
		this.addr = addr;
		this.refresh();
	}
	
	// return = [left wheel speed, right wheel speed]
	gamepadStickToVel(vel){
		vel[0] *= 0.3;
		vel[1] *= 0.3;
		
		const DEADZONE = 0.2;
		let dist = (vel[0]**2 + vel[1]**2)**0.5;
		if (dist < DEADZONE) return [0,0];
		
		let angle = Math.atan2(vel[1], vel[0]);	
		if (angle >= -Math.PI/2 && angle <= Math.PI/2) return [dist, vel[1]]; // right half
		else                                           return [vel[1], dist]; // left half
	}
	updateGamepadData(){
		if (!this.gamepad.on || this.gamepad.obj == null) return; 
		this.gamepad.obj = navigator.getGamepads()[this.gamepad.ind];
		
		this.data.move.com.vel = this.gamepadStickToVel([this.gamepad.obj.axes[0], -this.gamepad.obj.axes[1]]);
		// other buttons
		// ...
	}
	toggleGamepad(on){
		if (this.gamepad.on && !on) this.setVel0(); // from enabled to disabled
		this.gamepad.on = on;
	}
	connectGamepad(gamepad){
		this.gamepad.obj = gamepad;
	}
	disconnectGamepad(){
		if (this.gamepad.on) this.setVel0();
		this.gamepad.obj = null;
	}
	
	// grid board or auto discovery of markers ?
	toggleMarkersType(type){
		this.data.markers.type = type;
	}
	createMarkerGrid(w, h, cs, m){
		let ids = []
		let corners = []
		
		let s = cs + m*2 // total square size
		n=0
		for i in range(nb_w):
			for j in range(nb_h):
				
				ids.append(n) # ids
				n += 1
				
				yt = s*j + cell_m        ; yb = s*j + cell_m+cell_s
				xr = s*i + cell_m+cell_s ; xl = s*i + cell_m
				corners.append([ [xl,yt,0], [xl,yb,0], [xr,yb,0], [xr,yt,0] ]) # top left corner first, CCW order
	}
	
	draw(){
		// draw target flag
		ctx.save();
		ctx.translate(...this.data.move.auto.target);
		ctx.scale(1,-1);
		let imgw = this.pickerImg.width*mPERpx; 
		let imgh = this.pickerImg.height*mPERpx; 
		ctx.drawImage(this.pickerImg, 0, -imgh, imgw, imgh);
		ctx.restore();
		// draw tank
		ctx.save();
		ctx.fillStyle = this.color;
		ctx.translate(this.data.move.real.pos[0], this.data.move.real.pos[1]);
		ctx.rotate(-Math.atan2(this.data.move.real.dir[1], this.data.move.real.dir[0]));
		ctx.fill(this.path);
		ctx.restore();
	}
	
	dispmsg(msg){
		msgconsole.innerHTML += `<br>TANK&lt;${this.id}&gt; <b>::</b> ${msg}`;
	}
}
function addTank(){
	let tank = new Tank();
	tanks.push(tank);
	
	let tankidattr = `tankid="${tank.id}"`;
	
	// using "innerHTML +=" would destroy the previous event listeners 
	getdom('#div_tanks')[0].insertAdjacentHTML('beforeend', `
		<div class="div_tank" ${tankidattr}>
			<div>
				<span style="color:${tank.color};"><b>Tank</b></span> n°${tank.id} ${html_inputzone(1, 'input_tankaddr', [tank.addr], [tankidattr+" size=6"])} 
				<span class="span_unreachable" ${tankidattr} style="display:${tank.neterr ? 'inline' : 'none'};">unreachable</span>
				<input type="image" src="res/sync.png" class="btn_refresh btn"></input>
			</div><br>
			<details>
				<summary>Movement</summary>
				Mode: ${html_radiozone("radio_movemode", ["manual", "auto"], tank.data.move.auto.on ? 1 : 0, tankidattr)}
				<div>
					Target pos.: ${html_inputzone(
						2, 'input_targetpos',
						[tank.data.move.com.pos[0].toFixed(1), tank.data.move.com.pos[0].toFixed(1)],
						[tankidattr+' size=2', tankidattr+' size=2']
					)}<!--
					--><input type="image" src="res/click.png" class="btn_picktargetpos btn" ${tankidattr} style="animation:none;"></input>
				</div>
			</details>
			<details>
				<summary>Cannon</summary>
				Mode: ${html_radiozone("radio_cannonmode", ["manual", "auto"], tank.data.cannon.auto.on ? 1 : 0, tankidattr)}
			</details><br>
			<details>
				<summary>Markers</summary>
				Type: ${html_radiozone("radio_boardtype", ["grid", "auto"], tank.data.markers.type == 'auto' ? 1 : 0, tankidattr)}
				<div class="grid_params" ${tankidattr} style="display:${tank.data.markers.type == 'auto' ? 'none' : 'inline'}">
					<br>Nb. W: ${html_inputzone(
						4, 'input_gridparams',
						[ARUCO_GRID_NBW, ARUCO_GRID_NBH, ARUCO_GRID_CSIZE, ARUCO_GRID_CMARGIN],
						repeat(4, tankidattr+' size=2'),
						['   Nb. H: ', '<br>Cell size: ', '   Cell margin: ']
					)}
				</div>
			</details><br>
			<div>
				<input type="checkbox" class="check_gamepad" ${tank.gamepad.on ? "checked" : ""} ${tankidattr}>
				Gamepad ${html_inputzone(
					1, 'input_gamepadind',
					[tank.gamepad.ind],
					[tankidattr+" size=1"]
				)}
			</div>
			<div>
				<input type="checkbox" class="check_camera" ${tank.cam.on ? "checked" : ""}></input>Camera feed:
				<img width=200 style="-webkit-user-select:none;display:block;" ${tankidattr}>
			</div>
		</div>
	`);
	
	let tankdiv = getdom(`div[${tankidattr}]`)[0];
	
	// html_inputzone callbacks
	set_inputzone_callback(tankdiv);
	set_inputzonebtns_callbacks(nodes => tank.setAddr(nodes[0].value), 1, tankdiv, '.input_tankaddr');
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['move', 'auto', 'target'], [Number(nodes[0].value), Number(nodes[1].value)])
	, 2, tankdiv, '.input_targetpos');
	set_inputzonebtns_callbacks(nodes =>{
		try{
			let gamepad = navigator.getGamepads()[Number(nodes[0].value)];
			if (gamepad === null) throw new Error();
			tank.connectGamepad(gamepad);
		}
		catch{
			tank.disconnectGamepad();
			dispmsgGamepad(nodes[0].value, 'not connected');
		}
	}, 1, tankdiv, '.input_gamepadind');
	set_inputzonebtns_callbacks(
		nodes => tank.createMarkerGrid(...nodes.map(node => Number(node.value)))
	, 4, tankdiv, '.input_gridparams');
	
	// html_radiozone callbacks
	set_radiozone_callbacks(
		(nodezone, value) => tank.toggleMoveAuto(value == 'auto')
	, tankdiv, 'radio_movemode');
	set_radiozone_callbacks(
		(nodezone, value) => tank.sendOptsSET(['cannon', 'auto', 'on'], value == 'auto')
	, tankdiv, 'radio_cannonmode');
	set_radiozone_callbacks(
		(nodezone, value) =>{
			tank.toggleMarkersType(value);
			getdom('.grid_params')[0].style.display = value == 'auto' ? 'none' : 'inline';
		}
	, tankdiv, 'radio_boardtype');
	
	// other callbacks
	getdom('.btn_refresh', tankdiv)[0].addEventListener('click', ()=>tank.refresh() );
	getdom('.btn_picktargetpos', tankdiv)[0].addEventListener('click', function(){
		if (pospicker_tank == tank) unlatch_targetpospicker();
		else                        latch_targetpospicker(tank, this);
	});
	getdom('.check_gamepad', tankdiv)[0].addEventListener('change', function(){ tank.toggleGamepad(this.checked); });
	getdom('.check_camera', tankdiv)[0].addEventListener('change', function(){
		tank.cam.on = this.checked;
		if (this.checked) tank.initCamStream();
		else              tank.closeCamStream();
	});
}

let pospicker_tank = null;
function latch_targetpospicker(tank, node){
	canvas.style.cursor = `url('${tank.pickerUrl}') 0 24,auto`;
	getdom('.btn_picktargetpos').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	node.style.animation = null;
	node.style.boxShadow = 'none';
	pospicker_tank = tank;
}
function unlatch_targetpospicker(){
	canvas.style.cursor = 'auto';
	getdom('.btn_picktargetpos').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	pospicker_tank = null;
}

let fps = 20;
window.setInterval(() => {
	let canvasW_m = canvasW*mPERpx;
	let canvasH_m = canvasH*mPERpx;
	
	ctx.clearRect(-canvasW_m/2, -canvasH_m/2, canvasW_m, canvasH_m);
	tanks.forEach( tank => tank.draw() );
	
}, 1000/fps)


getdom("#btn_addtank")[0].addEventListener('click', addTank);

canvas.addEventListener("click", ev => {
	if (pospicker_tank !== null){
		ev.preventDefault();
		
		let invMat = ctx.getTransform().inverse();
		let [x, y] = [ ev.pageX - canvas.getBoundingClientRect().left, ev.pageY - canvas.getBoundingClientRect().top ];
		x = x * invMat.a + y * invMat.c + invMat.e;
		y = y * invMat.b + y * invMat.d + invMat.f;
		
		let textfields = getdom(`.input_targetpos[tankid='${pospicker_tank.id}']`);
		textfields[0].value = x.toFixed(4);
		textfields[1].value = y.toFixed(4);
		textfields.forEach(el => el.dispatchEvent(new Event("input")));
		getdom('.btn_ok', textfields[0].parentNode)[0].click();
		
		unlatch_targetpospicker();
	}
});

window.addEventListener("gamepadconnected", ev => {
	dispmsgGamepad(ev.gamepad.index, 'connected')
	let tank = tanks.find(tank => tank.gamepad.ind == ev.gamepad.index);
	if (tank) tank.connectGamepad(ev.gamepad);
});
window.addEventListener("gamepaddisconnected", ev => {
	dispmsgGamepad(ev.gamepad.index, 'disconnected');
	let tank = tanks.find(tank => tank.gamepad.ind == ev.gamepad.index);
	if (tank) tank.disconnectGamepad();
});

/*
TODO:
	. resizable video feed
	. add input to select speed factor for manual / auto control
	. add separate overlay canvas
	. canvas add axes
	. canvas support scroll / zoom
	. use input type number
*/
