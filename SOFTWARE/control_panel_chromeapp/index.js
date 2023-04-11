'use strict';

let cam_port = 81;
let coms_port = 82;

let getdom = (str, el=document) => [...el.querySelectorAll(str)];
let uniqueid_gen = function(){
	let tmp = -1;
	return function(){ return ++tmp; }
};
let uniqueids = [uniqueid_gen(), uniqueid_gen(), uniqueid_gen()];
let noop = ()=>{};
let obj_get = (obj, keys) => {
	for (key of keys) obj = obj[key];
	return obj;
};
let arr_last = arr => arr[arr.length-1];

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
	).join(sep);
	
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
	getdom(`input[type="radio"][name="${radioname}"]`, tankdiv)[0].addEventListener( 'click', function(){
		on_click(this.parentNode, this.value);
	} );
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

let pospicker_tank = null;

function latch_targetpospicker(node){
	let tank = tankfromnode(node);
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

// return = [left wheel speed, right wheel speed]
function velconvert(vel){
	vel[0] *= 0.3;
	vel[1] *= 0.3;
	
	const DEADZONE = 0.2;
	let dist = (vel[0]**2 + vel[1]**2)**0.5;
	if (dist < DEADZONE) return [0,0];
	
	let angle = Math.atan2(vel[1], vel[0]);	
	if (angle >= -Math.PI/2 && angle <= Math.PI/2) return [dist, vel[1]]; // right half
	else                                           return [vel[1], dist]; // left half
}

// note: delay is absolute time elapsed (i.e: independant of time taken to execute fun)
class Loop{
	constructor(fun, on_stop, types=[], delay=0){
		this.id = uniqueids[1]();
		this.types = types;
		
		this.fun = fun;
		this.delay = delay;
		this.on_stop = on_stop;
		
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
	rec(){
		if (!this.stopped && !this.infun && !this.indelay){
			if (this.delay != 0){
				this.indelay = true;
				window.setTimeout( ()=>{this.indelay = false; this.rec();}, this.delay );
			}
			this.infun = true;
			this.fun( ()=>{this.infun = false; this.rec();} );
		}
	}
}

let udp_streams = {}; // in udp streams
chrome.sockets.udp.onReceive.addListener( info => {
	//console.log(`Message from socket id "${info.socketId}" @${info.remoteAddress}:${info.remotePort}`);
	if (info.socketId in udp_streams) udp_streams[info.socketId].on_recv(info.data);
} );
class UDPStream{
	constructor(addr, port, on_recv=noop){
		this.port = port;
		this.on_recv = on_recv;
		this.on = false;
		this.setAddr(addr);
	}
	init(params={}){
		chrome.sockets.udp.create(params, sockinfo => {
			this.sockid = sockinfo.socketId;
			udp_streams[this.sockid] = this;
			chrome.sockets.udp.bind(this.sockid, this.addr, this.port, res => {
				if (res < 0) console.log("Error binding udp socket");
				else this.on = true;
			});
		});
	}
	send(data, callback=noop){
		chrome.sockets.udp.send(this.sockid, data, this.addr, this.port, info => {
			if (info.resultCode < 0) console.log("UDPStream send error");
			callback();
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
let tcp_streams = {}; // in tcp streams
chrome.sockets.tcp.onReceive.addListener( info => {
	if (info.socketId in tcp_streams) tcp_streams[info.socketId].on_recv(info.data);
} );
class TCPClient{
	constructor(addr, port, on_con=noop, on_recv=noop){
		this.port = port;
		this.addr = addr;
		this.on_recv = on_recv;
		this.on_con = on_con;
		this.on = false;
		this.setAddr(addr);
	}
	init(){
		chrome.sockets.tcp.create({}, sockinfo => {
			this.sockid = sockinfo.socketId;
			tcp_streams[this.sockid] = this;
			chrome.sockets.tcp.connect(this.sockid, this.addr, this.port, res => {
				if (res < 0) console.log("Error connecting to tcp socket");
				else{
					this.on = true;
					this.on_con();
				}
			});
		});
	}
	send(data){
		chrome.sockets.tcp.send(this.sockid, data, info => {
			if (info.resultCode < 0) console.log("TCPCLient send error");
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
	
	constructor(addr="localhost", color=null){
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
			}
		};
		
		this.id = uniqueids[0]();
		this.loops = {ids: {}, gamepad: {}, GET: {}, SET: {}};
		
		this.addr = addr;
		
		this.cam = { // in UDP stream
			reader: new FileReader(),
			img: null,
			stream: UDPStream(addr, cam_port, data =>{
				if (this.cam.reader.readyState != "LOADING") this.cam.reader.readAsDataURL(new Blob([data]));
			})
		};
		this.cam.reader.onloadend = () => this.cam.img.src = this.cam.reader.result;
		
		this.coms = {
			move: { // in/out UDP stream
				stream: UDPStream(addr, coms_port, this.getMoveData),
				out_loop: new Loop(this.setMoveData, noop, ['out_move'], 1000/10) // 10 FPS
			},
			opts: { // in/out TCP stream
				stream: TCPClient(addr, coms_port, this.in_tcp_coms)
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
	
	initCamStream(){
		this.cam.img = getdom(`img[tankid="${this.id}"]`)[0];
		this.cam.stream.init({bufferSize:4096*10}); // [!] If the recv buffer is too small, the packets are silently dropped [!]
		this.cam.img.style.display = 'block';
	}
	closeCamStream(){
		this.cam.stream.close();
		this.cam.img.style.display = 'none';
	}
	initComs(){
		this.coms.move.stream.init();
		this.coms.opts.stream.init();
	}
	closeComs(){
		this.coms.move.out_loop.stop();
		this.coms.move.stream.close();
		this.coms.opts.stream.close();
	}
	
	getMoveData(data){
		msg = String.fromCharCode.apply(null, data);
		for (line in msg.split('\n')){
			let [keys, vals] = line.split(';').map( el => el.split(',') );
			
			let obj = obj_get(this.data, keys.slice(0,-1));
			let key = arr_last(keys);
			
			if (vals.length == 1) obj[key] = Number(vals[0]);
			else                  obj[key] = vals.map( el => Number(el) );
		}
	}
	in_tcp_coms(data){
		
	}
	
	toggleNeterror(on){
		this.net.stop = on;
		getdom(`.span_unreachable[tankid="${this.id}"]`)[0].style.display = on ? 'inline' : 'none';
	}
	stopLoop(loop){
		loop.delFromPool(this.loops);
		loop.stop();
	}
	stopLoops(types=[]){
		if (types.length == 0) Object.values(this.loops.ids).forEach(loop => this.stopLoop(loop)); // stop all loops
		else                   [...new Set(types.map(type => Object.values(this.loops[type])).flat())].forEach(loop => this.stopLoop(loop)); 
	}
	
	setData(path, data, on_ok, on_errcode, on_errnet, on_netstop, loop=null){
		if (this.net.stop){
			on_netstop();
			if (loop !== null) this.stopLoop(loop); 
			return;
		}
		
		fetch(`http://${this.net.addr}:${COM_PORT}${path}`, {method: 'PUT', body: data})
		.then(res => {
			if (res.ok){
				on_ok();
				if (loop !== null) loop.rec();
			}
			else{
				if (loop !== null) this.stopLoop(loop);
				on_errcode(res.status, res.statusText);
				//this.toggleNeterror(true);
			}
		})
		.catch(err => {
			if (loop !== null) this.stopLoop(loop);
			on_errnet(err);
			this.toggleNeterror(true);
		});
	}
	setVec2dFromInput(parts, x, y, nodes){
		let path = '/'+parts.join('/');
		let obj = this[parts[0]][parts[1]][parts[2]];
		this.setData(
			path, `${x.toFixed(4)};${y.toFixed(4)}`, 
			() => {
				[obj[0], obj[1]] = [x, y];
				this.dispmsg(`${path} set to (${x};${y})`);
			}, 
			(code, status) => {
				setNodesVals(nodes, obj);
				this.dispmsg(`error setting ${path} (${code} ${status})`);
			},
			err => {
				setNodesVals(nodes, obj);
				this.dispmsg(`error setting ${path} (${err})`);
			},
			() => setNodesVals(nodes, obj)
		);
	}
	setVec2dFromLoop(parts, x, y, loop=null){ // loop is actually optional
		let path = '/'+parts.join('/');
		let obj = this[parts[0]][parts[1]][parts[2]];
		this.setData(
			path, `${x.toFixed(4)};${y.toFixed(4)}`, 
			() => [obj[0], obj[1]] = [x, y], 
			(code, status) => this.dispmsg(`error setting ${path} (${code} ${status})`),
			err => this.dispmsg(`error setting ${path} (${err})`),
			noop,
			loop
		);
	}
	setBool(parts, on, msg=false, node=null){
		let path = '/'+parts.join('/');
		let obj = this[parts[0]][parts[1]];
		this.setData(
			path + (on ? '/on' : '/off'), '',
			() => {
				obj.on = on;
				if (msg) this.dispmsg(`${path} set to ${on ? 'enabled' : 'disabled'}`);
				if (node != null) update_radiozone(node);
			}, 
			(code, status) => {
				if (node !== null) revert_radiozone(node);
				this.dispmsg(`error setting ${path} (${code} ${status})`);
			},
			err => {
				if (node !== null) revert_radiozone(node);
				this.dispmsg(`error setting ${path} (${err})`);
			},
			() => { if (node !== null) revert_radiozone(node); }
		);
	}
	
	getData(path, on_ok, on_errcode, on_errnet, on_netstop, loop=null){
		if (this.net.stop){
			on_netstop();
			if (loop !== null) this.stopLoop(loop); 
			return;
		}
		
		fetch(`http://${this.net.addr}:${COM_PORT}${path}`, {method: 'GET'})
		.then(res => {
			if (res.ok) res.text().then(txt => {
					on_ok(txt);
					if (loop !== null) loop.rec();
				}).catch(err => {
					if (loop !== null) this.stopLoop(loop);
					on_errnet(err); 
					this.toggleNeterror(true);
				});
			else{
				if (loop !== null) this.stopLoop(loop);
				on_errcode(res.status, res.statusText);
				this.toggleNeterror(true);
			}
		})
		.catch(err => {
			if (loop !== null) this.stopLoop(loop);
			on_errnet(err);
			this.toggleNeterror(true);
		});
	}
	getVec2d(parts, msg=false, loop=null){
		let path = '/'+parts.join('/');
		this.getData(
			path, 
			txt => {
				try{
					let [x,y] = txt.split(";");
					let obj = this[parts[0]][parts[1]][parts[2]];
					[obj[0], obj[1]] = [Number(x), Number(y)]; 
					if (msg) this.dispmsg(`${path} is (${x};${y})`); 
				}
				catch (err){ this.dispmsg(`error getting ${path} (${err})`); }
			}, 
			(code, status) => this.dispmsg(`error getting ${path} (${code} ${status})`),
			err            => this.dispmsg(`error getting ${path} (${err})`),
			noop,
			loop
		);
	}
	getBool(parts, msg=false){
		let path = '/'+parts.join('/');
		this.getData(
			path+'/on', 
			txt => {
				if (txt == '1'){ 
					this[parts[0]][parts[1]].on = true;   
					if (msg) this.dispmsg(`${path} is on`); 
				}
				else if (txt == '0'){ 
					this[parts[0]][parts[1]].on = false;   
					if (msg) this.dispmsg(`${path} is off`); 
				}
				else this.dispmsg(`error getting ${path}`);
			}, 
			(code, status) => this.dispmsg(`error getting ${path} (${code} ${status})`),
			err            => this.dispmsg(`error getting ${path} (${err})`),
			noop
		);
	}
	
	// sends new request once the answer to the previous one arrives
	// HTTP1.1 connections are "keep alive" by default so this should be fine in terms of latency 
	getLoop(fun, delay=500){ new Loop(fun, noop, ['GET'], delay).addToPool(this.loops).rec(); }
	getPosLoop(){ this.getLoop( loop => this.getVec2d(['move', 'real', 'pos'], false, loop) ) }
	getDirLoop(){ this.getLoop( loop => this.getVec2d(['move', 'real', 'dir'], false, loop) ) }
	
	getGamepadData(){
		this.gamepad.obj = navigator.getGamepads()[this.gamepad.ind];
		
		this.data.move.com.vel = velconvert([this.gamepad.obj.axes[0], -this.gamepad.obj.axes[1]]);
		// other buttons
		// ...
	}
	
	// send udp stream of move data (from gamepad or other source)
	setMoveData(rec){
		if (this.gamepad.on || this.gamepad.obj !== null) this.getGamepadData();
		// other sources
		// ...
		
		// prepare data
		msg = ''
		for (key1 in this.data){
			let part = this.data[key1].com;
			for (key2 in part){
				obj = part[key2];
				
				if (typeof obj == 'number') res += `${key1},com,${key2};${obj}\n`;
				else                        res += `${key1},com,${key2};${obj.join(',')}\n`;
			}
		}
		this.coms.move.stream.send( Uint8Array.from(msg, el => el.charCodeAt()), rec );
	}
	
	refresh(){
		this.toggleNeterror(false);
		this.dispmsg('refreshing connection...');
		
		// stop all loops
		this.stopLoops(['GET', 'SET']);
		// set values
		getdom(`.div_tank[tankid="${this.id}"] .btn_ok`).forEach(el => el.click());
		getdom(`.div_tank[tankid="${this.id}"] .div_radiozone input[checked]`).forEach(el => el.click());
		// get values
		this.getBool( ['move', 'auto'] );
		this.getBool( ['cannon', 'auto'] );
		this.getPosLoop();
		this.getDirLoop();
	}
	
	toggleGamepad(on){
		this.gamepad.on = on;
		if (on && this.gamepad.obj !== null){ // start gamepad loops
			this.stopLoops(['gamepad']);
			this.gamepadUpdateLoop();
		}
		else if (!on) this.setVec2dFromLoop(['move', 'com', 'vel'], 0, 0); // stop motors
	}
	connectGamepad(gamepad){
		this.gamepad.obj = gamepad;
		if (this.gamepad.on) this.toggleGamepad(true);
	}
	disconnectGamepad(){
		this.gamepad.obj = null;
		this.setVec2dFromLoop(['move', 'com', 'vel'], 0, 0); // stop motors
	}
	
	draw(){
		// draw target flag
		ctx.save();
		ctx.translate(...this.move.auto.target);
		ctx.scale(1,-1);
		let imgw = this.pickerImg.width*mPERpx; 
		let imgh = this.pickerImg.height*mPERpx; 
		ctx.drawImage(this.pickerImg, 0, -imgh, imgw, imgh);
		ctx.restore();
		// draw tank
		ctx.save();
		ctx.fillStyle = this.color;
		ctx.translate(this.move.real.pos[0], this.move.real.pos[1]);
		ctx.rotate(-Math.atan2(this.move.real.dir[1], this.move.real.dir[0]));
		ctx.fill(this.path);
		ctx.restore();
	}
	
	dispmsg(msg){
		msgconsole.innerHTML += `<br>TANK&lt;${this.net.tcp.addr}&gt; <b>::</b> ${msg}`;
	}
}
function addTank(){
	let tank = new Tank();
	tanks.push(tank);
	
	let tankidattr = `tankid="${tank.id}"`;
	
	getdom('#div_tanks')[0].innerHTML += `
		<div class="div_tank" ${tankidattr}>
			<div>
				<span style="color:${tank.color};"><b>Tank</b></span> ${html_inputzone("in_tankaddr", 1, [tank.net.addr], [tankidattr+" size=6"])} <span class="span_unreachable" ${tankidattr}>unreachable</span>
				<input type="image" src="res/sync.png" class="btn_refresh btn"></input>
			</div><br>
			<details>
				<summary>Movement</summary>
				Mode: ${html_radiozone("radio_movemode", ["manual", "auto"], tank.move.auto.on ? 1 : 0, tankidattr)}
				<div>
					Target pos.: ${html_inputzone(
						2, 'input_targetpos',
						[tank.move.com.pos[0].toFixed(1), tank.move.com.pos[0].toFixed(1)],
						[tankidattr+' size=2', tankidattr+' size=2']
					)}<!--
					--><input type="image" src="res/click.png" class="btn_picktargetpos btn" ${tankidattr} style="animation:none;"></input>
				</div>
			</details>
			<details>
				<summary>Cannon</summary>
				Mode: ${html_radiozone("radio_cannonmode", ["manual", "auto"], tank.cannon.auto.on ? 1 : 0, tankidattr)}
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
				<input type="checkbox" class="check_camera" checked></input>Camera feed:
				<img width=200 style="-webkit-user-select:none;display:block;" ${tankidattr}>
			</div>
		</div>
	`;
		
	let tankdiv = getdom(`div[${tankidattr}]`)[0];
	// html_inputzone callbacks
	getdom('.in_inputzone', tankdiv)[0].addEventListener( 'input', function(){getdom('div', this.parentNode)[0].style.display = 'inline';} );
	set_inputzonebtns_callbacks(in_targetpos, 2, tankdiv, '.input_targetpos');
	set_inputzonebtns_callbacks(in_gamepadind, 1, tankdiv, '.input_gamepadind');
	// html_radiozone callbacks
	set_radiozone_callbacks(toggle_mode_move, tankdiv, 'radio_movemode');
	set_radiozone_callbacks(toggle_mode_cannon, tankdiv, 'radio_cannonmode');
	// other callbacks
	getdom('.btn_refresh', tankdiv)[0].addEventListener( 'click', ()=>tankfromid(tank.id).refresh() );
	getdom('.btn_picktargetpos', tankdiv)[0].addEventListener( 'click', function(){pick_targetpos(this);} );
	getdom('.check_gamepad', tankdiv)[0].addEventListener( 'change', function(){toggle_gamepad(this);} );
	getdom('.check_camera', tankdiv)[0].addEventListener( 'change', function(){toggle_camerafeed(this);} );
}
let tankfromid = id => tanks.find(tank => tank.id == id)
let tankfromnode = node => tankfromid( Number(node.getAttribute('tankid')) );

function in_tankaddr(nodes){ tankfromnode(nodes[0]).setAddr(nodes[0].value); }
function in_targetpos(nodes){ tankfromnode(nodes[0]).setVec2dFromInput(['move', 'auto', 'target'], Number(nodes[0].value), Number(nodes[1].value), nodes); }
function pick_targetpos(node){
	if (pospicker_tank == tankfromnode(node)) unlatch_targetpospicker();
	else latch_targetpospicker(node);
}
function toggle_mode_move(nodezone, value)  { tankfromnode(nodezone).setBool(['move', 'auto']  , value == 'auto', true, nodezone); }
function toggle_mode_cannon(nodezone, value){ tankfromnode(nodezone).setBool(['cannon', 'auto'], value == 'auto', true, nodezone); }
function toggle_gamepad(node){ tankfromnode(node).toggleGamepad(node.checked); }
function in_gamepadind(nodes){
	try{
		let gamepad = navigator.getGamepads()[Number(nodes[0].value)];
		if (gamepad === null) throw new Error();
		tankfromnode(nodes[0]).connectGamepad(gamepad);
	}
	catch{
		tankfromnode(nodes[0]).disconnectGamepad();
		dispmsgGamepad(nodes[0].value, 'not connected');
	}
}
function toggle_camerafeed(node){ getdom('img', node.parentNode)[0].style.display = node.checked ? 'block' : 'none'; }


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
	. add input to select speed factor for manual / auto control
	. add separate overlay canvas
	. canvas add axes
	. canvas support scroll / zoom
	. use input type number
*/
