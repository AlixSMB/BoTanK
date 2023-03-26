'use strict';

const CAMFEED_PORT = 81;
const COM_PORT = 82;

let getdom = (str, el=document) => [...el.querySelectorAll(str)];
let uniqueid_gen = function(){
	let tmp = -1;
	return function(){ return ++tmp; }
};
let uniqueids = [uniqueid_gen(), uniqueid_gen()];
let noop = ()=>{};

function resetNodesVals(nodes) { nodes.forEach(node => node.value = node.getAttribute('oldvalue')); }
function updateNodesVals(nodes){ nodes.forEach(node => node.setAttribute('oldvalue', node.value)); }
function setNodesVals(nodes, vals){ nodes.forEach((node,ind) => {
	node.value = vals[ind];
	node.setAttribute('oldvalue', vals[ind]);
}); }
let html_inputzone = (on_ok, n=1, values=null, attrs=null, sep="<b>;</b>") => {
	let inputs = [...Array(n).keys()].map(ind => 
		`<input 
			type="text" 
			${ attrs === null ? "" : attrs[ind] } 
			${ values === null ? "value='' oldvalue=''" : `value="${values[ind]}" oldvalue="${values[ind]}"` } 
			oninput="getdom('div', this.parentNode)[0].style.display = 'inline';"
		>`
	).join(sep);
	
	return `<div class="div_inputzone" style="display:inline;">
			${inputs}<!--
			--><div class="div_inbtnctls" style="display:none;">
				<input type="image" src="res/check.png" class="btn_ok btn" onclick="
					let nodes = getdom('input', this.parentNode.parentNode).splice(0, ${n});
					${on_ok}(nodes);
					updateNodesVals(nodes);
					this.parentNode.style.display = 'none';
				">
				<input type="image" src="res/cancel.png" class="btn_cancel btn" onclick="
					resetNodesVals( getdom('input', this.parentNode.parentNode).splice(0, ${n}) );
					this.parentNode.style.display = 'none';
				">
			</div>
		</div>
	`;
};
let html_radiozone = (on_click, name, values, checked=0, zoneattr='', attrs=null) => {
	let radios = [...Array(values.length).keys()].map(ind => 
		`<input 
			type="radio" name="${name}" value="${values[ind]}"
			${ attrs === null ? "" : attrs[ind] } 
			${ checked == ind ? "checked" : "" } 
			onclick="${on_click}(this.parentNode, this.value);"
		>${values[ind]}`
	).join(' ');
	
	return `<div class="div_radiozone" style="display:inline;" oldvalue="${values[checked]}" ${zoneattr}>${radios}</div>`;
};
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
	const DEADZONE = 0.2;
	const LVS = [
		[2/3, 1/3], // max. dist, corresponding motor speed
		[10, 2/3]
	]
	const PI6 = Math.PI/6;
	const ZONES = [ // slices of PI/6
		[1, -1],  // turn right 1
		[1, 0.5], // go right
		[1, 1],   // go forward 1
		[1, 1],   // go forward 2
		[0.5, 1], // go left
		[-1, 1],  // turn left 1
		[-1, 1]   // turn left 2
	];
	
	let dist = (vel[0]**2 + vel[1]**2)**0.5;
	if (dist < DEADZONE) return [0,0];
	
	let angle = Math.atan2(vel[1], vel[0]);
	if (angle < 0) angle = 2*Math.PI+angle;
	
	let ind = Math.trunc(angle/PI6);
	if (ind >= ZONES.length) return [0,0];
	
	let speed = LVS.find(lv => lv[0]>=dist)[1];
	return [ ZONES[ind][0]*speed, ZONES[ind][1]*speed ];
}

class Loop{
	constructor(fun, on_stop, types=[], delay=0){
		this.id = uniqueids[1]();
		this.fun = fun;
		this.types = types;
		this.on_stop = on_stop;
		this.stopped = false;
		this.delay = delay;
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
	stop(){
		if (this.stopped) return this; // already stopped
		
		this.on_stop();
		this.stopped = true;
		return this;
	}
	rec(){
		if (!this.stopped){
			if (this.delay == 0) this.fun(this);
			else window.setTimeout( ()=>this.fun(this), this.delay );
		}
	}
}
let tanks = [];
class Tank{
	static colors = ['red', 'green', 'blue', 'orange', 'purple'];
	
	constructor( addr="localhost", color=null ){
		this.move = {
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
		};
		this.cannon = {
			com:  [0, 0], // yaw, pitch
			real: [0, 0],
			auto: { on: false }
		};
		
		this.id = uniqueids[0]();
		this.loops = {ids: {}, gamepad: {}, GET: {}, SET: {}};
		
		this.net = {
			addr: addr,
			stop: false
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
		
		this.gamepad = {
			on: false,
			ind: this.id,
			obj: null,
		};
	}
	
	setAddr(addr){
		this.net.addr = addr;
		getdom(`img[tankid="${this.id}"]`)[0].src = `http://${this.net.addr}:${CAMFEED_PORT}/video/mjpeg?t=${new Date().getTime()}`; // date is necessary to refresh the video stream
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
	
	gamepadUpdateLoop(delay=50){ // update our gamepad object
		new Loop(loop => {
				if (!this.gamepad.on || this.gamepad.obj === null) this.stopLoop(loop);
				else {
					this.gamepad.obj = navigator.getGamepads()[this.gamepad.ind];
					
					// send new data
					this.gamepadSetVel();
					// ...
					
					loop.rec(loop);
				}
			},
			noop, ['gamepad'], delay
		).addToPool(this.loops).rec();
	}
	gamepadSetVel(){
		let [x, y] = velconvert([this.gamepad.obj.axes[0], -this.gamepad.obj.axes[1]]);
		if (x != this.move.com.vel[0] || y != this.move.com.vel[1])
			this.setVec2dFromLoop(['move', 'com', 'vel'], x, y);
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
		msgconsole.innerHTML += `<br>TANK&lt;${this.net.addr}&gt; <b>::</b> ${msg}`;
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
				<input type="image" src="res/sync.png" onclick="tankfromid(${tank.id}).refresh()" class="btn_refresh btn"></input>
			</div><br>
			<details>
				<summary>Movement</summary>
				Mode: ${html_radiozone("toggle_mode_move", "radio_movemode", ["manual", "auto"], tank.move.auto.on ? 1 : 0, tankidattr)}
				<div>
					Target pos.: ${html_inputzone(
						'in_targetpos', 2, 
						[tank.move.com.pos[0].toFixed(1), tank.move.com.pos[0].toFixed(1)],
						[tankidattr+' size=2 class="input_targetpos"', tankidattr+' size=2 class="input_targetpos"']
					)}<!--
					--><input type="image" src="res/click.png" onclick="pick_targetpos(this);" class="btn_picktargetpos btn" ${tankidattr} style="animation:none;"></input>
				</div>
			</details>
			<details>
				<summary>Cannon</summary>
				Mode: ${html_radiozone("toggle_mode_cannon", "radio_cannonmode", ["manual", "auto"], tank.cannon.auto.on ? 1 : 0, tankidattr)}
			</details><br>
			<div>
				<input type="checkbox" onchange="toggle_gamepad(this);" ${tank.gamepad.on ? "checked" : ""} ${tankidattr}>
				Gamepad ${html_inputzone(
					"in_gamepadind", 1, 
					[tank.gamepad.ind],
					[tankidattr+" size=1"]
				)}
			</div>
			<div>
				<input type="checkbox" onchange="toggle_camerafeed(this);" checked></input>Camera feed:
				<img width=200 style="-webkit-user-select:none;display:block;" ${tankidattr}>
			</div>
		</div>
	`;
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

//canvas.addEventListener("mousemove", ev => {
//	
//});
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
	. canvas add axes
	. canvas support scroll / zoom
	. use input type number
*/
