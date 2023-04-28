'use strict';

const cam_port = 8081;
const opts_port = 8082;
const coms_port_in = 8083;
const coms_port_out = 8082;
const HEARTBEAT_MAXTIME = 3000;

// default dimensions of aruco grid
const ARUCO_GRID_NBW = 8;
const ARUCO_GRID_NBH = 5;
const ARUCO_GRID_CSIZE = 0.0366; // cell size in meters
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

let canvas = getdom('#canvas_main')[0]; // main canvas
let canvas_overlay = getdom('#canvas_overlay')[0]; // common overlay canvas
let canvasW = canvas.width; let canvasH = canvas.height;

let base_size = 1; // canavs size in meters
let pxPerM = Math.min(canvasW, canvasH) / base_size;

let ctx = {main: canvas.getContext('2d'), overlay: canvas_overlay.getContext('2d')};
for (let key in ctx){
	//ctx[key].scale(1, -1);                  // set y axis pointing up
	ctx[key].translate(canvasW/2, canvasH/2); // origin at center
}

let disp_grid = true;
let grid_from = 0;

// add to html
getdom("#div_canvas")[0].style.height = `${canvasH}px`;
let div_map = getdom("#div_map")[0];
div_map.insertAdjacentHTML('beforeend', `
	<br><input type="checkbox" id="check_dispgrid" ${disp_grid ? "checked" : ""}>
	Grid from tank n°${html_inputzone(1, 'input_gridfrom', [grid_from], ["size=2"])}
`);
getdom('#check_dispgrid', div_map)[0].addEventListener('change', function(){ 
	disp_grid = this.checked;
	drawOverlay();
});
set_inputzone_callback(div_map);
set_inputzonebtns_callbacks(
	nodes =>{ grid_from = nodes[0].value; drawOverlay(); }
, 1, div_map, '.input_gridfrom');

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
	init(on_con=noop, on_err=noop, params={}){
		if (this.on) return;
		
		chrome.sockets.tcp.create(params, sockinfo => {
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
				
				auto_s: 0.035,
				auto: {
					corners: [],
					ids: []
				},
				grid: {
					corners: [],
					ids: []
				}
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
		let base = 0.07*pxPerM; let height = 0.1*pxPerM; // in m
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
		getdom(`.div_videofeed[tankid="${this.id}"]`)[0].style.display = 'block';
	}
	closeCamStream(){
		this.cam.stream.close();
		if (this.cam.img != null) getdom(`.div_videofeed[tankid="${this.id}"]`)[0].style.display = 'none';
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
			this.sendOptsHeartbeat.bind(this), noop, ['coms', 'out_hbt'], 500, HEARTBEAT_MAXTIME, this.toggleNeterror.bind(this, true) // heartbeat every 1/2s, error if no answer after 1.5s
		).addToPool(this.loops);
	}
	regenComsLoops(){
		this.regenMoveDataLoop();
		this.regenHeartbeatLoop();
	}
	initComs(on_con){
		this.regenComsLoops();
		
		this.coms.move.stream.init();
		this.coms.opts.stream.init(
			()=>{
				this.coms.opts.heartbeat_loop.start();
				on_con();
			},
			this.toggleNeterror.bind(this, true), {bufferSize:4096*10} // buffer needs to fit all the grid markers data
		); 
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
	// some responses can be actually be sent without having a corresponding request, those are dealt with on a case-by-case
	getOptsResp(resp){
		String.fromCharCode.apply( null, new Uint8Array(resp) ).split('\n\n').forEach( msg => {
			if (msg != ''){
				if (msg.startsWith("SETAUTOMARKERS")) this.getOptsAutoMarkers(msg);
				else                                  this.coms.opts.handlers.shift()(msg);
			}
		});
	}
	getOptsAutoMarkers(msg){
		let mids = [];
		let cornersAll = [];
		for (let line of msg.split('\n').splice(1)){
			if (line == "") continue;
			
			let [mid, corners] = line.split(';;');
			mids.push(Number(mid));
			cornersAll.push(corners.split(';').map( corner => corner.split(',').map(coord => Number(coord)) ));
		}
		
		this.data.markers.auto.corners = cornersAll;
		this.data.markers.auto.ids = mids;
		getdom(`.div_tank[tankid="${this.id}"] .nb_markers`)[0].innerHTML = mids.length;
		drawOverlay();
	}
	// send opts request to tcp server
	sendOptsReq(req, callback=noop){
		if (this.neterr) return;
		this.sendData(req, this.coms.opts.stream);
		this.coms.opts.handlers.push(callback);
	}
	sendOptsSET(parts, val){ // send SET request
		let type = typeof val;
		     if (type == 'boolean') this.sendOptsReq(`SET\n${parts.join(',')};${val ? '1' : '0'}\n\n`);
		else if (type == 'number')  this.sendOptsReq(`SET\n${parts.join(',')};${val}\n\n`);
		else if (type == 'string')  this.sendOptsReq(`SET\n${parts.join(',')};${val}\n\n`);
		else /* array */            this.sendOptsReq(`SET\n${parts.join(',')};${val.join(',')}\n\n`);
		
		obj_set(this.data, parts, val);
		this.dispmsg(`"${parts}" set to "${val}"`);
	}
	sendOptsGET(parts){ // send GET request
		this.sendOptsReq(`GET\n${parts.join(',')}\n\n`, this.parseData);
	}
	sendOptsDO(action, desc=null){ // send DO request
		this.sendOptsReq(`DO\n${action}\n\n`);
		this.dispmsg(`"${desc == null ? action : desc}" done"`);
	}
	sendOptsHeartbeat(rec){
		this.sendOptsReq('HEARTBEAT\n\n', rec); // the response msg contents will be ignored, only the fact that a response was sent back is important
	}
	sendOptsMarkers(){
		let type = this.data.markers.type;
		if (type == 'auto') return; // would be useless
		
		let ids = this.data.markers[type].ids;
		let corners = this.data.markers[type].corners;
		
		let msg = "SETMARKERS\n";
		for (let i=0; i<ids.length; i++){
			msg += `${type};;${ids[i]};;` + corners[i].map(corner => corner.join(',')).join(';') + '\n';
		}
		this.sendOptsReq(msg + '\n');
		this.dispmsg(`"${type}" type marker data sent`);
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
			getdom(`.div_tank[tankid="${this.id}"] .div_radiozone input:checked`).forEach(el => el.dispatchEvent(new Event("change")));
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
		
		getdom(`.div_tank[tankid="${this.id}"] .markers_params`).forEach( node => node.style.display = "none" ); // hide all parameters divs
		getdom(`.div_tank[tankid="${this.id}"] .${type}_params`)[0].style.display = "inline";
		
		this.sendOptsSET(['markers', 'type'], type)
		
		if (type == 'grid') getdom(`.div_tank[tankid="${this.id}"] .grid_params .btn_ok`)[0].click(); // regen grid and send it
		else drawOverlay();
	}
	createMarkerGrid(w, h, cs, cm){
		let ids = [];
		let corners = [];
		
		let s = cs + cm*2; // total square size
		let n = 0;
		for (let i=0; i<w; i++){
			for (let j=0; j<h; j++){
				
				ids.push(n);
				n += 1;
				
				let yt = s*j + cm   ; let yb = s*j + cm+cs;
				let xr = s*i + cm+cs; let xl = s*i + cm;
				corners.push([ [xl,yt,0], [xr,yt,0], [xr,yb,0], [xl,yb,0] ]) // top left corner first, CW order
			}
		}
		
		this.data.markers.grid.corners = corners;
		this.data.markers.grid.ids = ids;
		
		this.sendOptsMarkers();
		drawOverlay();
	}
	
	draw(){
		ctx.main.save();
		ctx.main.fillStyle = this.color;
		ctx.main.translate(this.data.move.real.pos[0]*pxPerM, this.data.move.real.pos[1]*pxPerM); // flip y coord
		ctx.main.rotate(Math.PI/2 - Math.atan2(this.data.move.real.dir[1], this.data.move.real.dir[0]));
		ctx.main.fill(this.path);
		ctx.main.restore();
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
				<div class="markers_params_container">
					<div class="markers_params grid_params" ${tankidattr} style="display:${tank.data.markers.type == 'grid' ? 'inline' : 'none'}">
						Nb. W: ${html_inputzone(
							4, 'input_gridparams',
							[ARUCO_GRID_NBW, ARUCO_GRID_NBH, ARUCO_GRID_CSIZE, ARUCO_GRID_CMARGIN],
							repeat(4, tankidattr+' size=2'),
							['   Nb. H: ', '<br>Cell size: ', '   Cell margin: ']
						)}
					</div>
					<div class="markers_params auto_params" ${tankidattr} style="display:${tank.data.markers.type == 'auto' ? 'inline' : 'none'}">
						Cell size: ${html_inputzone(
							1, 'input_autoparams',
							[ARUCO_GRID_CSIZE], [tankidattr+' size=2']
						)}
						<br><input type="button" class="btn_addmarkers" value="Add markers">
						<input type="button" class="btn_resetmarkers" value="Reset markers"><br>
						<span class="nb_markers">0</span> markers found
					</div>
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
				<input type="checkbox" class="check_camera" ${tank.cam.on ? "checked" : ""}>Camera feed:
				<div class="div_videofeed resizable" ${tankidattr}>
					<img style="width:auto; height: 100%;" ${tankidattr}>
				</div>
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
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['markers', 'auto_s'], Number(nodes[0].value))
	, 1, tankdiv, '.input_autoparams');
	
	// html_radiozone callbacks
	set_radiozone_callbacks(
		(nodezone, value) => tank.toggleMoveAuto(value == 'auto')
	, tankdiv, 'radio_movemode');
	set_radiozone_callbacks(
		(nodezone, value) => tank.sendOptsSET(['cannon', 'auto', 'on'], value == 'auto')
	, tankdiv, 'radio_cannonmode');
	set_radiozone_callbacks(
		(nodezone, value) => tank.toggleMarkersType(value)
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
	getdom('.btn_addmarkers', tankdiv)[0].addEventListener('click', function(){ tank.sendOptsDO('SNAPAUTOBOARD', '"Add auto markers"'); });
	getdom('.btn_resetmarkers', tankdiv)[0].addEventListener('click', function(){ tank.sendOptsDO('RESETAUTOBOARD', '"Reset auto markers"'); });
}

let pospicker_tank = null;
function latch_targetpospicker(tank, node){
	canvas_overlay.style.cursor = `url('${tank.pickerUrl}') 0 24,auto`;
	getdom('.btn_picktargetpos').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	node.style.animation = null;
	node.style.boxShadow = 'none';
	pospicker_tank = tank;
}
function unlatch_targetpospicker(){
	canvas_overlay.style.cursor = 'auto';
	getdom('.btn_picktargetpos').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	pospicker_tank = null;
	drawOverlay();
}
function drawOverlay(){
	ctx.overlay.clearRect(-canvasW/2, -canvasH/2, canvasW, canvasH);
	
	// draw grid
	if (disp_grid){
		let type = tanks[grid_from].data.markers.type;
		let corners = tanks[grid_from].data.markers[type].corners;
		let ids = tanks[grid_from].data.markers[type].ids;
		let color = tanks[grid_from].color;
		for (let i=0; i<ids.length; i++){
			
			ctx.overlay.beginPath();
			ctx.overlay.lineWidth = 2;
			ctx.overlay.strokeStyle = 'black';
			ctx.overlay.moveTo(corners[i][0][0]*pxPerM, corners[i][0][1]*pxPerM);
			ctx.overlay.lineTo(corners[i][1][0]*pxPerM, corners[i][1][1]*pxPerM);
			ctx.overlay.lineTo(corners[i][2][0]*pxPerM, corners[i][2][1]*pxPerM);
			ctx.overlay.lineTo(corners[i][3][0]*pxPerM, corners[i][3][1]*pxPerM);
			ctx.overlay.closePath();
			ctx.overlay.stroke();
			
		}
	}
	
	// draw targets
	for (let tank of tanks){
		let imgw = tank.pickerImg.width; 
		let imgh = tank.pickerImg.height; 
		ctx.overlay.drawImage(tank.pickerImg, tank.data.move.auto.target[0]*pxPerM, tank.data.move.auto.target[1]*pxPerM - imgh);
	}
}


let fps = 20;
window.setInterval(() => {
	ctx.main.clearRect(-canvasW/2, -canvasH/2, canvasW, canvasH);
	tanks.forEach( tank => tank.draw() );
	
}, 1000/fps)


getdom("#btn_addtank")[0].addEventListener('click', addTank);

canvas_overlay.addEventListener("click", ev => {
	if (pospicker_tank !== null){
		ev.preventDefault();
		
		let invMat = ctx.overlay.getTransform().inverse();
		let canvasRect = canvas.getBoundingClientRect();
		let [x, y] = [ ev.pageX - canvasRect.left, ev.pageY - canvasRect.top ];
		x = (x * invMat.a + y * invMat.c + invMat.e)/pxPerM;
		y = (y * invMat.b + y * invMat.d + invMat.f)/pxPerM;
		
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
	. add ability to delete specific markers from auto board
	. add press X on gamepad to take auto board snap
	. add support for multiple tanks (using different ports ?)
	. add input to select speed factor for manual / auto control
	. canvas add axes
	. canvas support scroll / zoom
	. use input type number
*/
