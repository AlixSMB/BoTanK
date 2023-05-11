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

const DEFAULT_BOARD_TYPES = ["grid", "custom", "auto"];

// default marked obstacles
const ARUCO_OBST_SIZE = 0.05; // m
const DEFAULT_MARKEDOBST_COLLIDERS = ['AABB', 'Hull'];
const DEFAULT_MARKEDOBST_COLLIDER = 'AABB';

// default marker ids
const DEFAULT_MIDRANGE_POSITIONING = [0, 200];
const DEFAULT_MIDRANGE_OBST = [201, 249];

// default speeds
const DEFAULT_MOVEAUTO_SPEED = 0.3;
const DEFAULT_MOVEMANUAL_SPEED = 0.3;

// gamepad constant
const GAMEPAD_REFRESH_RATE = 1000/10;
const GAMEPAD_Y_BTN = 3;
const GAMEPAD_X_BTN = 2;

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
let html_inputzone = (n=1, classes="", values=null, attrs=null, sep=null, type='text') => {
	sep = sep == null ? "<b> ; </b>" : sep;
	let inputs = 
		type == 'text' ? [...Array(n).keys()].map(ind => 
			`<input 
				type="text" 
				${ attrs === null ? "" : attrs[ind] } 
				${ values === null ? "value='' oldvalue=''" : `value="${values[ind]}" oldvalue="${values[ind]}"` }
				class="in_inputzone ${classes}"
			>`
		) : 
		[...Array(n).keys()].map(ind => 
			`<textarea
				${ attrs === null ? "" : attrs[ind] } 
				${ values === null ? "value='' oldvalue=''" : `value="${values[ind]}" oldvalue="${values[ind]}"` }
				class="in_inputzone ${classes}"
			></textarea>`
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
		let nodes = getdom('.in_inputzone', this.parentNode.parentNode).splice(0, n);
		on_ok(nodes);
		updateNodesVals(nodes);
		this.parentNode.style.display = 'none';
	} );
	getdom('.btn_cancel', inputzone)[0].addEventListener( 'click', function(){
		resetNodesVals( getdom('.in_inputzone', this.parentNode.parentNode).splice(0, n) );
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

let html_sliderboxzone = (min, max, val, name, boxattrs='') => `
	${html_inputzone(1,'input_'+name,[val],[boxattrs])}
	<input type="range" class="slider_${name}" min="${min}" max="${max}" value="${val}" step="${(max-min)/100}">
`;
function set_sliderbox_callback(el, name, callback){
	let slider = getdom('.slider_'+name, el)[0];
	let box = getdom('.input_'+name, el)[0];
	
	set_inputzonebtns_callbacks(nodes =>{
		slider.value = nodes[0].value;
		callback(nodes[0].value);
	}, 1, el, '.input_'+name);
	
	slider.addEventListener('input', function(){ box.value = this.value; });
	slider.addEventListener('change', function(){ callback(this.value); });
}

let msgconsole = getdom('#div_msg')[0];
function dispmsgGamepad(ind, msg){
	msgconsole.innerHTML += `<br>GAMEPAD&lt;${ind}&gt; <b>::</b> ${msg}`;
}

let canvases = getdom('canvas');
let canvas_overlay_top = arr_last(canvases);
let ctx = {
	main: canvases[0].getContext('2d'),
	overlay: canvases[1].getContext('2d'),
	overlay2: canvases[2].getContext('2d'),
	overlay3: canvases[3].getContext('2d')
};
let canvasW = canvases[0].width; let canvasH = canvases[0].height;
let base_size = 1; // canavs size in meters
let pxPerM = Math.min(canvasW, canvasH) / base_size;

function setCanvasTransform(x, y, rotx, roty){
	for (let key of ['main', 'overlay']){
		ctx[key].setTransform(1,0,0,1, canvasW/2+x, canvasH/2+y); // origin at center at first
		ctx[key].transform(rotx, roty, -roty, rotx, 0,0);
	}
}
setCanvasTransform(0,0,1,0);

let disp_grid = true;
let grid_from = 0;
let tank_centered = false;
let tank_centerid = 0;
let origX = 0;
let origY = 0;
let origRot = 0;
// added to html
// grid display
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
set_inputzonebtns_callbacks(
	nodes =>{ grid_from = nodes[0].value; drawOverlay(); }
, 1, div_map, '.input_gridfrom');
// origin pos, zoom, rotation, tank centered
div_map.insertAdjacentHTML('afterBegin', `
	Origin X: ${html_sliderboxzone(-5, 5, origX ,'origx', 'size=2')}
	Origin Y: ${html_sliderboxzone(-5, 5, origY ,'origy', 'size=2')}
	<br>Rotation: ${html_sliderboxzone(0, 2*Math.PI, origRot ,'origrot', 'size=2')}
	<br>px/m:  ${html_sliderboxzone(10, 1000, pxPerM ,'scale', 'size=2')}
	<br><input type="checkbox" id="check_tankcentered" ${tank_centered ? "checked" : ""}>Centered on tank n°${html_inputzone(1, 'input_tankcentered', [tank_centerid], ["size=2"])}<br><br>
`);
function setStaticCanvas(){
	setCanvasTransform(origX*pxPerM, origY*pxPerM, Math.cos(origRot), Math.sin(origRot));
	drawOverlay();
}
getdom('#check_tankcentered', div_map)[0].addEventListener('change', function(){ 
	tank_centered = this.checked;
	if (!this.checked) setStaticCanvas();
});
set_sliderbox_callback(div_map, 'origx',   value =>{ origX = Number(value);   setStaticCanvas(); });
set_sliderbox_callback(div_map, 'origy',   value =>{ origY = Number(value);   setStaticCanvas(); });
set_sliderbox_callback(div_map, 'origrot', value =>{ origRot = Number(value); setStaticCanvas(); });
set_sliderbox_callback(div_map, 'scale',   value =>{ pxPerM = Number(value);  setStaticCanvas(); });
set_inputzonebtns_callbacks(nodes => tank_centerid = nodes[0].value, 1, div_map, '.input_tankcentered');
set_inputzone_callback(div_map);

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
					dir: [1, 0], // 0°
					vel: [0, 0]
				},
				auto: { // automatic mode
					on: false,
					type: 'target',
					target: [0, 0],
					trajectory: [],
					speed: DEFAULT_MOVEAUTO_SPEED
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
				
				disp_ids: false,
				ids_range: DEFAULT_MIDRANGE_POSITIONING,
				
				auto_s: 0.035,
				auto: {
					corners: [],
					ids: []
				},
				grid: {
					corners: [],
					ids: []
				},
				custom: {
					corners: [],
					ids: []
				}
			},
			obstacles: {
				virtual: {
					rects: [],
					lines: [],
					w: 1
				},
				marked: {
					obj: [],
					ids_range: DEFAULT_MIDRANGE_OBST,
					s: ARUCO_OBST_SIZE,
					collider: DEFAULT_MARKEDOBST_COLLIDER,
					w: 1
				}
			},
			camera: {
				db_view: {on: false},
				treshold_min: null,
				treshold_max: null,
				treshold_const: null
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
			
			speed: DEFAULT_MOVEMANUAL_SPEED,
			dir: 1,
			
			interval: window.setInterval(this.updateGamepadData.bind(this), GAMEPAD_REFRESH_RATE),
			btn_clicks: {}
		};
		this.gamepad.btn_clicks[GAMEPAD_Y_BTN] = false;
		this.gamepad.btn_clicks[GAMEPAD_X_BTN] = false;
		
		// tank icon, tip is at 0,0 (camera position)
		this.color = color === null ? Tank.colors[ Tank.colors.length % (this.id+1) ] : color;
		this.path = new Path2D();
		let base = 0.07; let height = 0.1; // in m
		this.path.moveTo(-height, -base/2);
		this.path.lineTo(-height, base/2);
		this.path.lineTo(0, 0);
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
			
			let parts = line.split(';');
			let keys = parts[0] ; let vals = parts[1];
			
			keys = keys.split(',');
			
			let obj = obj_get(this.data, keys.slice(0,-1));
			let key = arr_last(keys);
			
			let is2d = parts.length == 3; // 1d or 2d array
			
			if (!is2d){ // single value or 1 dimensional array
				vals = vals.split(',');
				if (vals.length == 1){
					if (key == 'on') obj[key] = vals[0] == '1' ? true : false;
					else             obj[key] = Number(vals[0]);
				}
				else                 obj[key] = vals.map( el => Number(el) );
			}
			
			else{ // 2D array
				obj[key] = vals.split('|').map(str => str.split(',').map(el => Number(el)));
			}
		}
	}
	// send move / opts string data, handle errors
	sendData(msg, socket, callback=noop){
		if (this.neterr) return;
		
		socket.send( Uint8Array.from(msg, el => el.charCodeAt()), callback, this.toggleNeterror.bind(this, true) );
	}
	
	// receive opts response from tcp server, split into individual messages
	// some responses can be actually be sent without having a corresponding request, those are dealt with on a case-by-case
	getOptsResp(resp){
		String.fromCharCode.apply( null, new Uint8Array(resp) ).split('\n\n').forEach( msg => {
			if (msg != ''){
				if      (msg.startsWith("SETAUTOMARKERS"))    this.getOptsAutoMarkers(msg);
				else if (msg.startsWith("SETCURRENTTRAJPNT")) this.getOptsCurrentTrajPnt(msg);
				else                                          this.coms.opts.handlers.shift()(msg);
			}
		});
	}
	getOptsAutoMarkers(msg){
		let mids = [];
		let cornersAll = [];
		
		let parts = msg.split('\n');
		let allids = parts[1].split(';')[1];
		getdom(`.div_tank[tankid="${this.id}"] .nb_markers`)[0].innerHTML = allids == '' ? 0 : Number(allids.split(',').length);
		
		for (let line of parts.splice(2)){
			if (line == "") continue;
			
			let [mid, corners] = line.split(';;');
			mids.push(Number(mid));
			cornersAll.push(corners.split(';').map( corner => corner.split(',').map(coord => Number(coord)) ));
		}
		
		this.data.markers.auto.corners = cornersAll;
		this.data.markers.auto.ids = mids;
		getdom(`.div_tank[tankid="${this.id}"] .nb_markers_used`)[0].innerHTML = mids.length;
		getdom(`.div_tank[tankid="${this.id}"] .marker_orig`)[0].innerHTML = Math.min(...mids);
		drawOverlay();
	}
	getOptsCurrentTrajPnt(msg){
		getdom(`.div_tank[tankid="${this.id}"] .current_traj_pnt`)[0].innerHTML = msg.split('\n')[1];
	}
	// send opts request to tcp server
	sendOptsReq(req, callback=noop){
		if (this.neterr) return;
		this.sendData(req, this.coms.opts.stream);
		this.coms.opts.handlers.push(callback);
	}
	sendOptsSET(parts, val=null){ // send SET request
		let setval;
		if (val == null){
			val = obj_get(this.data, parts);
			setval = false;
		}
		else setval = true;
		
		let type = typeof val;
		     if (type == 'boolean') this.sendOptsReq(`SET\n${parts.join(',')};${val ? '1' : '0'}\n\n`);
		else if (type == 'number')  this.sendOptsReq(`SET\n${parts.join(',')};${val}\n\n`);
		else if (type == 'string')  this.sendOptsReq(`SET\n${parts.join(',')};${val}\n\n`);
		else /* array */            this.sendOptsReq(`SET\n${parts.join(',')};${val.join(',')}\n\n`);
		
		if (setval) obj_set(this.data, parts, val);
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
	setMoveAutoType(type){
		this.sendOptsSET(['move', 'auto', 'type'], type);
		drawOverlay();
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
			getdom(`.div_tank[tankid="${this.id}"] .check_db_view`)[0].dispatchEvent(new Event("change"));
		});
		
	}
	setAddr(addr){
		this.addr = addr;
		this.refresh();
	}
	
	// return = [left wheel speed, right wheel speed]
	gamepadStickToVel(vel){
		vel[0] *= this.gamepad.speed;
		vel[1] *= this.gamepad.speed;
		let s = this.gamepad.dir;
		
		const DEADZONE = 0.2;
		let dist = (vel[0]**2 + vel[1]**2)**0.5;
		if (dist < DEADZONE) return [0,0];
		
		let angle = Math.atan2(vel[1], vel[0]);	
		if (angle >= -Math.PI/2 && angle <= Math.PI/2) return [s*dist,   s*vel[1]]; // right half
		else                                           return [s*vel[1], s*dist  ]; // left half
	}
	updateGamepadData(){
		if (!this.gamepad.on || this.gamepad.obj == null) return; 
		this.gamepad.obj = navigator.getGamepads()[this.gamepad.ind];
		
		this.data.move.com.vel = this.gamepadStickToVel([this.gamepad.obj.axes[0], -this.gamepad.obj.axes[1]]);
		this.data.cannon.com.yaw = Math.atan2(this.gamepad.obj.axes[3], this.gamepad.obj.axes[2]);
		
		let mappings = [
			[GAMEPAD_Y_BTN, this.snapAutoMarker.bind(this)], 
			[GAMEPAD_X_BTN, ()=>getdom(`.check_manualmovedir[tankid="${this.id}"]`)[0].click()]
		];
		for (let mapping of mappings){
			if (this.gamepad.obj.buttons[mapping[0]].pressed){
				if (!this.gamepad.btn_clicks[mapping[0]]){
					mapping[1]();
					this.gamepad.btn_clicks[mapping[0]] = true;
				}
			}
			else this.gamepad.btn_clicks[mapping[0]] = false;
		}
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
		
		if (['grid', 'custom'].includes(type)) getdom(`.div_tank[tankid="${this.id}"] .${type}_params .btn_ok`)[0].click(); // regen grid and send it
		
		drawOverlay();
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
	createCustomMarkerGrid(val){
		// data like: id1,x1,y1,z1,...,x4,y4,z4,id2,...
		let parts = val.split(',');
		this.data.markers.custom.corners = [];
		this.data.markers.custom.ids = [];
		
		if (parts[0] != ""){
			for (let i=0; i<parts.length; i+=13){
				let corners = parts.slice(i+1, i+13).map(el=>Number(el));
				this.data.markers.custom.corners.push([ corners.slice(0, 3), corners.slice(3, 6), corners.slice(6, 9), corners.slice(9, 12) ]);
				this.data.markers.custom.ids.push(Number(parts[i]));
			}
		}
		
		this.sendOptsMarkers();
		drawOverlay();
	}
	snapAutoMarker(){
		this.sendOptsDO('SNAPAUTOBOARD', '"Add auto markers"');
	}
	
	addVirtualObstacle(vals, part){
		this.data.obstacles.virtual[part].push(...vals);
		this.sendOptsSET(['obstacles', 'virtual', part]);
		drawOverlay();
	}
	delVirtualObstacle(ind, part){
		if (part == 'lines') this.data.obstacles.virtual[part].splice(ind*4, 4);
		else /* rects */     this.data.obstacles.virtual[part].splice(ind*8, 8);
		this.sendOptsSET(['obstacles', 'virtual', part]);
		drawOverlay();
	}
	
	draw(){
		ctx.main.fillStyle = this.color;
		
		// draw tank
		if (tank_centered && tank_centerid == this.id){
			ctx.main.setTransform(
				this.data.move.real.dir[0], this.data.move.real.dir[1], -this.data.move.real.dir[1], this.data.move.real.dir[0],
				canvasW/2, canvasH/2
			);
			ctx.main.scale(pxPerM, pxPerM); 
			ctx.main.fill(this.path); // draw tank in center, rotated
			
			// everything else relative to tank	
			setCanvasTransform( (-this.data.move.real.pos[0])*pxPerM, (-this.data.move.real.pos[1])*pxPerM, 1,0 );
			
			drawOverlay(); // have to redraw overlay everytime in this situation
		}
		else{
			ctx.main.save();
			ctx.main.translate(this.data.move.real.pos[0]*pxPerM, this.data.move.real.pos[1]*pxPerM); // flip y coord
			ctx.main.rotate(Math.atan2(this.data.move.real.dir[1], this.data.move.real.dir[0]));
			ctx.main.scale(pxPerM, pxPerM);
			ctx.main.fill(this.path);
			ctx.main.restore();
		}
		
		// draw marked obstacles
		ctx.main.save();
		ctx.overlay.strokeStyle = this.color;
		ctx.overlay.lineWidth = 4;
		let obj = this.data.obstacles.marked.obj;
		for (let obst of obj){
			ctx.main.beginPath();
			ctx.main.moveTo(obst[0]*pxPerM, obst[1]*pxPerM);
			for (let i=2; i<obst.length; i+=2) ctx.main.lineTo(obst[i]*pxPerM, obst[i+1]*pxPerM);
			ctx.main.closePath();
			ctx.main.stroke();
		}
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
				<div class="move_params_container">
					
					<div class="move_params automove_params" style="display:${tank.data.move.auto.on ? 'inline' : 'none'}">
						Speed: ${html_sliderboxzone(0, 1, DEFAULT_MOVEAUTO_SPEED ,'moveautospeed', 'size=2')}
						<br><br>Type: ${html_radiozone("radio_moveautomode", ["target", "trajectory"], tank.data.move.auto.type == 'target' ? 0 : 1, tankidattr)}
						
						<div class="moveauto_params_container">
							<div class="targetmoveauto_params move_params2" style="display:${tank.data.move.auto.type == 'target' ? 'inline' : 'none'}">
								Target pos.: ${html_inputzone(
									2, 'input_targetpos',
									[tank.data.move.com.pos[0].toFixed(1), tank.data.move.com.pos[0].toFixed(1)],
									[tankidattr+' size=2', tankidattr+' size=2']
								)}<!--
								--><input type="image" src="res/click.png" class="btn_picktargetpos btn_blink btn" ${tankidattr} style="animation:none;"></input>
							</div>
							
							<div class="trajectorymoveauto_params move_params2" style="display:${tank.data.move.auto.type == 'trajectory' ? 'inline' : 'none'}">
								Trajectory: ${html_inputzone(1, 'input_trajectory', [''], [tankidattr+" style='vertical-align:middle;'"], null, 'textarea')}<!--
								--><input type="image" src="res/click.png" class="btn_picktrajectory btn_blink btn" ${tankidattr} style="animation:none;"></input>
								<br>Current trajectory target point: <span class="current_traj_pnt">0</span>
							</div>
						</div>
						
						<br><br><input type="button" class="btn_startAutoMove" value="Start">
						<input type="button" class="btn_stopAutoMove" value="Stop">
					</div>
					
					<div class="move_params manualmove_params" style="display:${tank.data.move.auto.on ? 'none' : 'inline'}">
						Speed: ${html_sliderboxzone(0, 1, DEFAULT_MOVEMANUAL_SPEED ,'movemanualspeed', 'size=2')}
						<br><input type="checkbox" class="check_manualmovedir" ${tankidattr}>reverse   <img src='res/xbox_btn_X.svg' class="xbox_btn">
					</div>
				</div>
			</details>
			<details>
				<summary>Cannon</summary>
				Mode: ${html_radiozone("radio_cannonmode", ["manual", "auto"], tank.data.cannon.auto.on ? 1 : 0, tankidattr)}
			</details><br>
			<details>
				<summary>Markers</summary>
				Type: ${html_radiozone("radio_boardtype", ["grid", "custom", "auto"], DEFAULT_BOARD_TYPES.indexOf(tank.data.markers.type), tankidattr)}
				<div class="markers_params_container">
					<input type="checkbox" class="check_displayids" ${tank.data.markers.disp_ids ? "checked" : ""}>Display IDs
					<br>IDs range (inclusive): ${html_inputzone(
						2, 'input_posmarkersidrange',
						DEFAULT_MIDRANGE_POSITIONING,
						repeat(2, tankidattr+' size=2'),
						'<b> - </b>'
					)}<br><br>
					<div class="markers_params grid_params" ${tankidattr} style="display:${tank.data.markers.type == 'grid' ? 'inline' : 'none'}">
						Nb. W: ${html_inputzone(
							4, 'input_gridparams',
							[ARUCO_GRID_NBW, ARUCO_GRID_NBH, ARUCO_GRID_CSIZE, ARUCO_GRID_CMARGIN],
							repeat(4, tankidattr+' size=2'),
							['   Nb. H: ', '<br>Cell size: ', 'm   Cell margin: ']
						)}m
					</div>
					<div class="markers_params custom_params" ${tankidattr} style="display:${tank.data.markers.type == 'custom' ? 'inline' : 'none'}">
						Corners: ${html_inputzone(1, 'input_customparams', [''], [tankidattr+" style='vertical-align:middle;'"], null, 'textarea')}
						<br>from file <input type='file'class='input_customfile'>
					</div>
					<div class="markers_params auto_params" ${tankidattr} style="display:${tank.data.markers.type == 'auto' ? 'inline' : 'none'}">
						Cell size: ${html_inputzone(
							1, 'input_autoparams',
							[ARUCO_GRID_CSIZE], [tankidattr+' size=2']
						)}m
						<br><button class="btn_addmarkers">Add markers <img src='res/xbox_btn_Y.svg' class="xbox_btn"></button>
						<input type="button" class="btn_resetmarkers" value="Reset markers"><br>
						<span class="nb_markers">0</span> markers found<br>
						<span class="nb_markers_used">0</span> markers used with origin at marker n°<span class="marker_orig">0</span>
					</div>
				</div>	
			</details>
			<details>
				<summary>Obstacles</summary>
				<details style="margin-left: 1rem;">
					<summary>Virtual</summary>
					Weight: ${html_inputzone(1, 'input_virtobstw', [tank.data.obstacles.virtual.w], [tankidattr+' size=2'])}
					<br>Rect: <textarea class="input_virtobstrect" style="vertical-align:middle;" ${tankidattr}></textarea><!--
					--><input type="image" src="res/click.png" class="btn_pickvirtobstrect btn_blink btn" ${tankidattr} style="animation:none;"></input>
					<br><input type="button" class="btn_addvirtobstrect" value="Add rect">
					<br><input type="button" class="btn_delvirtobstrect" value="Remove rect"> id n°<input type="text" class="input_delvirtobstrect" value=0 size=1>
					<br><br>Line: <textarea class="input_virtobstline" style="vertical-align:middle;" ${tankidattr}></textarea><!--
					--><input type="image" src="res/click.png" class="btn_pickvirtobstline btn_blink btn" ${tankidattr} style="animation:none;"></input>
					<br><input type="button" class="btn_addvirtobstline" value="Add line">
					<br><input type="button" class="btn_delvirtobstline" value="Remove line"> id n°<input type="text" class="input_delvirtobstline" value=0 size=1>
				</details>
				<details style="margin-left: 1rem;">
					<summary>Marked</summary>
					<div style="max-width: 15rem;">
						N markers per obstacle, marker ids per obstacle should all be the same
					</div>
					<br>Weight: ${html_inputzone(1, 'input_markedobstw', [tank.data.obstacles.marked.w], [tankidattr+' size=2'])}
					<br>IDs range (inclusive): ${html_inputzone(
						2, 'input_obstmarkersidrange',
						tank.data.obstacles.marked.ids_range,
						repeat(2, tankidattr+' size=2'),
						'<b> - </b>'
					)}
					<br>Cell size: ${html_inputzone(
						1, 'input_markedobst_size',
						[tank.data.obstacles.marked.s], [tankidattr+' size=2']
					)}m
					<br><br>Collider: ${html_radiozone("radio_markedobstmode", DEFAULT_MARKEDOBST_COLLIDERS, DEFAULT_MARKEDOBST_COLLIDERS.indexOf(tank.data.obstacles.marked.collider), tankidattr)}
				</details>
			</details>	
			<br>
			<div>
				<input type="checkbox" class="check_gamepad" ${tank.gamepad.on ? "checked" : ""} ${tankidattr}>
				Gamepad ${html_inputzone(
					1, 'input_gamepadind',
					[tank.gamepad.ind],
					[tankidattr+" size=1"]
				)}
			</div>
			<input type="checkbox" class="check_db_view" ${tank.data.camera.db_view.on ? "checked" : ""} ${tankidattr}>Debug view
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
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['move', 'auto', 'trajectory'], nodes[0].value.split(',').map(part => Number(part)))
	, 1, tankdiv, '.input_trajectory');
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
		nodes => tank.createCustomMarkerGrid(nodes[0].value)
	, 1, tankdiv, '.input_customparams');
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['markers', 'auto_s'], Number(nodes[0].value))
	, 1, tankdiv, '.input_autoparams');
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['markers', 'ids_range'], nodes.map(node => Number(node.value)))
	, 2, tankdiv, '.input_posmarkersidrange');
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['obstacles', 'marked', 'ids_range'], nodes.map(node => Number(node.value)))
	, 2, tankdiv, '.input_obstmarkersidrange');
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['obstacles', 'marked', 's'], Number(nodes[0].value))
	, 1, tankdiv, '.input_markedobst_size');
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['obstacles', 'virtual', 'w'], Number(nodes[0].value))
	, 1, tankdiv, '.input_virtobstw');
	set_inputzonebtns_callbacks(
		nodes => tank.sendOptsSET(['obstacles', 'marked', 'w'], Number(nodes[0].value))
	, 1, tankdiv, '.input_markedobstw');
	
	// html_radiozone callbacks
	set_radiozone_callbacks(
		(nodezone, value) =>{
			getdom('.move_params', tankdiv).forEach( node => node.style.display = "none" );
			getdom(`.${value}move_params`, tankdiv)[0].style.display = 'inline';
			tank.toggleMoveAuto(value == 'auto');
		},
	tankdiv, 'radio_movemode');
	set_radiozone_callbacks(
		(nodezone, value) => tank.sendOptsSET(['cannon', 'auto', 'on'], value == 'auto')
	, tankdiv, 'radio_cannonmode');
	set_radiozone_callbacks(
		(nodezone, value) => tank.toggleMarkersType(value)
	, tankdiv, 'radio_boardtype');
	set_radiozone_callbacks(
		(nodezone, value) =>{
			getdom('.move_params2', tankdiv).forEach( node => node.style.display = "none" );
			getdom(`.${value}moveauto_params`, tankdiv)[0].style.display = 'inline';
			tank.setMoveAutoType(value);
		}
	, tankdiv, 'radio_moveautomode');
	set_radiozone_callbacks(
		(nodezone, value) => tank.sendOptsSET(['obstacles', 'marked', 'collider'], value)
	, tankdiv, 'radio_markedobstmode');
	
	// html_sliderboxzone callbacks
	set_sliderbox_callback(tankdiv, 'moveautospeed', value => tank.sendOptsSET(['move','auto','speed'], Number(value)));
	set_sliderbox_callback(tankdiv, 'movemanualspeed', value => tank.gamepad.speed = Number(value));
	
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
	getdom('.btn_addmarkers', tankdiv)[0].addEventListener('click', ()=> tank.snapAutoMarker());
	getdom('.btn_resetmarkers', tankdiv)[0].addEventListener('click', ()=> tank.sendOptsDO('RESETAUTOBOARD', '"Reset auto markers"'));
	getdom('.check_manualmovedir', tankdiv)[0].addEventListener('change', function(){ tank.gamepad.dir = this.checked ? -1 : 1; });
	getdom('.check_displayids', tankdiv)[0].addEventListener('change', function(){ 
		tank.data.markers.disp_ids = this.checked;
		drawOverlay();
	});
	getdom('.btn_startAutoMove', tankdiv)[0].addEventListener('click', ()=> tank.sendOptsDO('STARTMOVEAUTO', '"Start auto. movement"'));
	getdom('.btn_stopAutoMove', tankdiv)[0].addEventListener('click', ()=> tank.sendOptsDO('STOPMOVEAUTO', '"Stop auto. movement"'));
	getdom('.btn_pickvirtobstrect', tankdiv)[0].addEventListener('click', function(){
		if (virtobstrect_tank == tank) unlatch_virtobstrect();
		else                           latch_virtobstrect(tank, this);
	});
	getdom('.btn_pickvirtobstline', tankdiv)[0].addEventListener('click', function(){
		if (virtobstline_tank == tank) unlatch_virtobstline();
		else                           latch_virtobstline(tank, this);
	});
	getdom('.btn_addvirtobstrect', tankdiv)[0].addEventListener('click', function(){
		tank.addVirtualObstacle(getdom('.input_virtobstrect', this.parentNode)[0].value.split(',').map(el=>Number(el)), 'rects')
	});
	getdom('.btn_delvirtobstrect', tankdiv)[0].addEventListener('click', function(){
		tank.delVirtualObstacle(Number(getdom('.input_delvirtobstrect', this.parentNode)[0].value), 'rects')
	});
	getdom('.btn_addvirtobstline', tankdiv)[0].addEventListener('click', function(){
		tank.addVirtualObstacle(getdom('.input_virtobstline', this.parentNode)[0].value.split(',').map(el=>Number(el)), 'lines')
	});
	getdom('.btn_delvirtobstline', tankdiv)[0].addEventListener('click', function(){
		tank.delVirtualObstacle(Number(getdom('.input_delvirtobstline', this.parentNode)[0].value), 'lines')
	});
	getdom('.btn_picktrajectory', tankdiv)[0].addEventListener('click', function(){
		if (trajectorypicker_tank == tank) unlatch_trajectorypicker();
		else                               latch_trajectorypicker(tank, this);
	});
	getdom('.check_db_view', tankdiv)[0].addEventListener('change', function(){
		tank.sendOptsSET(['camera', 'db_view', 'on'], this.checked);
	});
	getdom('.input_customfile', tankdiv)[0].addEventListener('change', function(ev){
		let reader = new FileReader();
		reader.readAsText(ev.target.files[0], 'UTF-8');
		reader.onload = rev => {
			getdom('.input_customparams', tankdiv)[0].value = rev.target.result;
			getdom('.custom_params .btn_ok', tankdiv)[0].click();
		}
	});
}

let pospicker_tank = null;
function latch_targetpospicker(tank, node){
	canvas_overlay_top.style.cursor = `url('${tank.pickerUrl}') 0 24,auto`;
	getdom('.btn_picktargetpos').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	node.style.animation = null;
	node.style.boxShadow = 'none';
	pospicker_tank = tank;
}
function unlatch_targetpospicker(){
	canvas_overlay_top.style.cursor = 'auto';
	getdom('.btn_picktargetpos').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	pospicker_tank = null;
	drawOverlay();
}

let virtobstrect_tank = null;
function latch_virtobstrect(tank, node){
	canvas_overlay_top.style.cursor = 'crosshair';
	getdom('.btn_pickvirtobstrect').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	node.style.animation = null;
	node.style.boxShadow = 'none';
	virtobstrect_tank = tank;
}
function unlatch_virtobstrect(){
	canvas_overlay_top.style.cursor = 'auto';
	getdom('.btn_pickvirtobstrect').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	virtobstrect_tank = null;
	drawOverlay();
}
let virtobstline_tank = null;
function latch_virtobstline(tank, node){
	canvas_overlay_top.style.cursor = 'crosshair';
	getdom('.btn_pickvirtobstline').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	node.style.animation = null;
	node.style.boxShadow = 'none';
	virtobstline_tank = tank;
}
function unlatch_virtobstline(){
	canvas_overlay_top.style.cursor = 'auto';
	getdom('.btn_pickvirtobstline').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	virtobstline_tank = null;
	drawOverlay();
}

let trajectorypicker_tank = null;
function latch_trajectorypicker(tank, node){
	canvas_overlay_top.style.cursor = 'crosshair';
	getdom('.btn_picktrajectory').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	node.style.animation = null;
	node.style.boxShadow = 'none';
	trajectorypicker_tank = tank;
	mouse.last_clicks = [];
}
function unlatch_trajectorypicker(){
	canvas_overlay_top.style.cursor = 'auto';
	getdom('.btn_picktrajectory').forEach(el => {
		el.style.animation = 'none';
		el.style.boxShadow = null;
	});
	
	let textarea = getdom(`.input_trajectory[tankid='${trajectorypicker_tank.id}']`)[0];
	textarea.value = mouse.last_clicks.map(pos => pos.slice(0,2).map(el=>el.toFixed(4)).join(',')).join(',');
	textarea.dispatchEvent(new Event("input"));
	getdom('.btn_ok', textarea.parentNode)[0].click();
	
	ctx.overlay3.clearRect(0, 0, canvasW, canvasH);
	trajectorypicker_tank = null;
	mouse.last_clicks = [];
	
	drawOverlay();
}

function drawOverlay(){
	ctx.overlay.save();
	ctx.overlay.setTransform(1, 0, 0, 1, 0, 0);
	ctx.overlay.clearRect(0, 0, canvasW, canvasH);
	ctx.overlay.restore();
	
	// draw grid
	if (disp_grid){
		let tank = tanks[grid_from];
		let type = tank.data.markers.type;
		let corners = tank.data.markers[type].corners;
		let ids = tank.data.markers[type].ids;
		
		ctx.overlay.lineWidth = 2;
		ctx.overlay.setLineDash([]);
		ctx.overlay.strokeStyle = tank.color;
		
		for (let i=0; i<ids.length; i++){
			
			let [x1,y1] = [Math.round(corners[i][0][0]*pxPerM), Math.round(corners[i][0][1]*pxPerM)];
			let [x2,y2] = [Math.round(corners[i][1][0]*pxPerM), Math.round(corners[i][1][1]*pxPerM)];
			let [x3,y3] = [Math.round(corners[i][2][0]*pxPerM), Math.round(corners[i][2][1]*pxPerM)];
			let [x4,y4] = [Math.round(corners[i][3][0]*pxPerM), Math.round(corners[i][3][1]*pxPerM)];
			
			ctx.overlay.beginPath();
			ctx.overlay.lineWidth = 2;
			ctx.overlay.setLineDash([]);
			ctx.overlay.strokeStyle = tank.color;
			ctx.overlay.moveTo(x1, y1);
			ctx.overlay.lineTo(x2, y2);
			ctx.overlay.lineTo(x3, y3);
			ctx.overlay.lineTo(x4, y4);
			ctx.overlay.closePath();
			ctx.overlay.stroke();
			
			if (tank.data.markers.disp_ids){
				let xmin = Math.min(x1, x2, x3, x4); let xmax = Math.max(x1, x2, x3, x4); // AABB of marker
				let ymin = Math.min(y1, y2, y3, y4); let ymax = Math.max(y1, y2, y3, y4); // 
				let s = Math.min(xmax-xmin, ymax-ymin)-3;
				
				ctx.overlay.font = `${s}px sans serif bold`;
				ctx.overlay.fillText(ids[i], xmin+3, ymax-3);
			}
		}
	}
	
	for (let tank of tanks){
		// draw trajectory
		if (tank.data.move.auto.type == 'trajectory'){
			ctx.overlay.strokeStyle = tank.color;
			ctx.overlay.setLineDash([2, 2]);
			ctx.overlay.lineWidth = 5;
			
			let points = tank.data.move.auto.trajectory;
			ctx.overlay.beginPath();
			ctx.overlay.moveTo(points[0]*pxPerM, points[1]*pxPerM)
			for (let i=2; i<points.length; i+=2) ctx.overlay.lineTo(points[i]*pxPerM, points[i+1]*pxPerM)
			ctx.overlay.stroke();
		}
		
		// draw virtual obstacles		
		ctx.overlay.strokeStyle = tank.color;
		ctx.overlay.setLineDash([4, 4]);
		ctx.overlay.lineWidth = 4;
		ctx.overlay.font = `30px sans serif`;
		
		let rects = tank.data.obstacles.virtual.rects;
		for (let i=0; i<rects.length; i+=8){
			ctx.overlay.beginPath();
			ctx.overlay.moveTo(rects[i]*pxPerM, rects[i+1]*pxPerM);
			ctx.overlay.lineTo(rects[i+2]*pxPerM, rects[i+3]*pxPerM);
			ctx.overlay.lineTo(rects[i+4]*pxPerM, rects[i+5]*pxPerM);
			ctx.overlay.lineTo(rects[i+6]*pxPerM, rects[i+7]*pxPerM);
			ctx.overlay.closePath();
			ctx.overlay.stroke();
			ctx.overlay.fillText(i/8, rects[i]*pxPerM+15, rects[i+1]*pxPerM+30);
		}
		let lines = tank.data.obstacles.virtual.lines;
		for (let i=0; i<lines.length; i+=4){
			ctx.overlay.beginPath();
			ctx.overlay.moveTo(lines[i]*pxPerM, lines[i+1]*pxPerM);
			ctx.overlay.lineTo(lines[i+2]*pxPerM, lines[i+3]*pxPerM);
			ctx.overlay.stroke();
			ctx.overlay.fillText(i/4, lines[i]*pxPerM+15, lines[i+1]*pxPerM+30);
		}
		
		// draw targets
		if (tank.data.move.auto.type == 'target'){
			let imgw = tank.pickerImg.width; 
			let imgh = tank.pickerImg.height; 
			ctx.overlay.drawImage(tank.pickerImg, tank.data.move.auto.target[0]*pxPerM, tank.data.move.auto.target[1]*pxPerM - imgh);
		}
	}
}

let fps = 20;
window.setInterval(() => {
	ctx.main.save();
	ctx.main.setTransform(1, 0, 0, 1, 0, 0);
	ctx.main.clearRect(0, 0, canvasW, canvasH);
	ctx.main.restore();
	
	tanks.forEach( tank => tank.draw() );
	
}, 1000/fps)

getdom("#btn_addtank")[0].addEventListener('click', addTank);

let convert_mouse_pos_px = ev =>{
	let canvasRect = canvas_overlay_top.getBoundingClientRect();
	return [ ev.pageX - canvasRect.left, ev.pageY - canvasRect.top ];
};
let convert_mouse_pos = ev =>{
	let invMat = ctx.overlay.getTransform().inverse();
	let [x, y] = convert_mouse_pos_px(ev);
	return [ (x * invMat.a + y * invMat.c + invMat.e)/pxPerM, (x * invMat.b + y * invMat.d + invMat.f)/pxPerM, x, y ];
};
let mouse = {
	last_clicks: [],
	start_drag: null,
	pressed: false
};
canvas_overlay_top.addEventListener("mousedown", ev => {
	mouse.pressed = true;
	if (mouse.start_drag == null){
		mouse.start_drag = convert_mouse_pos(ev);
	}
});
canvas_overlay_top.addEventListener("mouseup", ev => {
	mouse.pressed = false;
	
	if (mouse.start_drag != null){
		
		if (virtobstline_tank != null){
			ctx.overlay2.clearRect(0, 0, canvasW, canvasH);
			
			let [x, y] = convert_mouse_pos(ev);
			
			let textfield = getdom(`.input_virtobstline[tankid='${virtobstline_tank.id}']`)[0];
			textfield.value = `${mouse.start_drag[0].toFixed(4)},${mouse.start_drag[1].toFixed(4)},${x.toFixed(4)},${y.toFixed(4)}`;
			
			unlatch_virtobstline();
		}
		if (virtobstrect_tank != null){
			ctx.overlay2.clearRect(0, 0, canvasW, canvasH);
			
			let p3 = convert_mouse_pos(ev);
			
			let textfield = getdom(`.input_virtobstrect[tankid='${virtobstrect_tank.id}']`)[0];
			let invMat = ctx.overlay.getTransform().inverse();
			let p1 = mouse.start_drag;
			let [x2, y2] = [(p1[2] * invMat.a + p3[3] * invMat.c + invMat.e)/pxPerM, (p1[2] * invMat.b + p3[3] * invMat.d + invMat.f)/pxPerM];
			let [x4, y4] = [(p3[2] * invMat.a + p1[3] * invMat.c + invMat.e)/pxPerM, (p3[2] * invMat.b + p1[3] * invMat.d + invMat.f)/pxPerM];
			textfield.value = [p1[0],p1[1],x2,y2,p3[0],p3[1],x4,y4].map(el=>el.toFixed(4)).join(','); // CW from top left
			
			unlatch_virtobstrect();
		}
		
		mouse.start_drag = null;
	}
});
canvas_overlay_top.addEventListener("mousemove", ev => {
	if (mouse.last_clicks.length != 0 && trajectorypicker_tank != null){
		ctx.overlay3.clearRect(0, 0, canvasW, canvasH);
		ctx.overlay3.setLineDash([7, 7]);
		ctx.overlay3.lineWidth = 2;
		ctx.overlay3.strokeStyle = '#000000';
		ctx.overlay3.beginPath();
		
		let [x, y] = convert_mouse_pos_px(ev);
		ctx.overlay3.moveTo(x, y);
		for (let i=mouse.last_clicks.length-1; i>=0; i--) ctx.overlay3.lineTo(mouse.last_clicks[i][2], mouse.last_clicks[i][3]);
		ctx.overlay3.stroke();
	}
	
	if (mouse.pressed){
		if (mouse.start_drag != null){
			if (virtobstline_tank != null){
				ctx.overlay2.clearRect(0, 0, canvasW, canvasH);
				ctx.overlay2.beginPath();
				let [x, y] = convert_mouse_pos_px(ev);
				ctx.overlay2.moveTo(mouse.start_drag[2], mouse.start_drag[3]);
				ctx.overlay2.lineTo(x, y);
				ctx.overlay2.strokeStyle = '#000000';
				ctx.overlay2.setLineDash([7, 7]);
				ctx.overlay2.lineWidth = 2;
				ctx.overlay2.stroke();
			}
			if (virtobstrect_tank != null){
				ctx.overlay2.clearRect(0, 0, canvasW, canvasH);
				ctx.overlay2.beginPath();
				let [x, y] = convert_mouse_pos_px(ev);
				ctx.overlay2.rect(mouse.start_drag[2], mouse.start_drag[3], x-mouse.start_drag[2], y-mouse.start_drag[3])
				ctx.overlay2.strokeStyle = '#000000';
				ctx.overlay2.setLineDash([7, 7]);
				ctx.overlay2.lineWidth = 2;
				ctx.overlay2.stroke();
			}
		}
	}
});
canvas_overlay_top.addEventListener("click", ev => {
	mouse.last_clicks.push(convert_mouse_pos(ev));
		
	if (pospicker_tank !== null){
		ev.preventDefault();
		
		let [x, y] = convert_mouse_pos(ev);
		
		let textfields = getdom(`.input_targetpos[tankid='${pospicker_tank.id}']`);
		textfields[0].value = x.toFixed(4);
		textfields[1].value = y.toFixed(4);
		textfields[0].dispatchEvent(new Event("input"));
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
	. add input for obstacles weight
	. add ability to delete specific markers from auto board
	. add cannon behavior	
	. add support for multiple tanks (using different ports ?) (using udp broadcast to set ports ?)
	. use input type number
*/
