'use strict';

let getdom = (str, el=document) => [...el.querySelectorAll(str)];
let uniqueid = (function(){
	let tmp = 0;
	return function(){ return ++tmp; }
})();

function resetNodesVals(nodes) { nodes.forEach(node => node.value = node.getAttribute('oldvalue')); }
function updateNodesVals(nodes){ nodes.forEach(node => node.setAttribute('oldvalue', node.value)); }
let html_inputzone = (on_ok, n=1, values=null, attrs=null, sep="<b>;</b>") => {
	let inputs = [...Array(n).keys()].map(ind => 
		`<input 
			type="text" 
			${ attrs === null ? "" : attrs[ind] } 
			${ values === null ? "value='' oldvalue=''" : `value="${values[ind]}" oldvalue="${values[ind]}"` } 
			oninput="getdom('div', this.parentNode)[0].style.display = 'inline';"
		></input>`
	).join(sep);
	
	return `<div class="div_inputzone" style="display:inline;">
			${inputs}<!--
			--><div class="div_inbtnctls" style="display:none;">
				<input type="image" src="res/check.png" class="btn_ok" onclick="
					let nodes = getdom('input', this.parentNode.parentNode).splice(0, ${n});
					${on_ok}(nodes);
					this.parentNode.style.display = 'none';
				"></input>
				<input type="image" src="res/cancel.png" class="btn_cancel" onclick="
					resetNodesVals( getdom('input', this.parentNode.parentNode).splice(0, ${n}) );
					this.parentNode.style.display = 'none';
				"></input>
			</div>
		</div>
	`;
};

let msgconsole = getdom('#div_msg')[0];

let canvas = getdom('canvas')[0];
let canvasW = canvas.width; let canvasH = canvas.height;
let ctx = canvas.getContext('2d');
ctx.scale(1, -1);           // set y axis pointing up
ctx.translate(0, -canvasH); // origin at bottom left

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
		
		this.id = uniqueid();
		this.addr = addr;
		this.netloops = 0;
		this.netstop = false;
		
		this.color = color === null ? Tank.colors[ Tank.colors.length % this.id ] : color;
		this.path = new Path2D();
		let base = 10; let height = 20;
		this.path.moveTo(-base/2,0);
		this.path.lineTo(base/2, 0);
		this.path.lineTo(0, height);
		this.path.closePath();
	}
	
	setAddr(addr){
		this.addr = addr;
		getdom(`img[tankid="${this.id}"]`)[0].src = `http://${this.addr}:8080/video/mjpeg`;
	}
	
	toggleNeterror(on){
		this.netstop = on;
		getdom(`.span_unreachable[tankid="${this.id}"]`)[0].style.display = on ? 'inline' : 'none';
	}
	
	setData(path, data, on_ok, on_errcode, on_errnet, isloop){
		if (this.netstop){
			if (isloop) this.netloops--; 
			return;
		}
		
		fetch(`http://${this.addr}:8081${path}`, {method: 'PUT', body: data})
		.then(res => {
			if (res.ok) on_ok();
			else{
				if (isloop) this.netloops--;
				on_errcode(res.status, res.statusText);
				this.toggleNeterror(true);
			}
		})
		.catch(err => {
			if (isloop) this.netloops--;
			on_errnet(err);
			this.toggleNeterror(true);
		});
	}
	setVec2d(x, y, parts, msg=false, callback=null, isloop=false, nodes=null){
		let path = '/'+parts.join('/');
		this.setData(
			path, `${x.toFixed(1)};${y.toFixed(1)}`, 
			() => {
				let obj = this[parts[0]][parts[1]][parts[2]];
				[obj.x, obj.y] = [x, y];
				if (nodes !== null) updateNodesVals(nodes);
				if (msg) this.dispmsg(`${path} set to (${x};${y})`);
				if (callback !== null) callback();
			}, 
			(code, status) => {
				if (nodes !== null) resetNodesVals(nodes);
				self.dispmsg(`error setting ${path} (${code} ${status})`);
			},
			err => {
				if (nodes !== null) resetNodesVals(nodes);
				self.dispmsg(`error setting ${path} (${err})`);
			},
			isloop
		);
	}
	setBool(parts, on, msg=false, node=null){
		let path = '/'+parts.join('/');
		this.setData(
			path + on ? '/on' : '/off', ''
			() => {
				this[parts[0]][parts[1]].on = on;
				if (msg) self.dispmsg(`${parts} set to ${on ? 'enabled' : 'disabled'}`);
			}, 
			(code, status) => {
				if (node !== null) node.checked = this[parts[0]][parts[1]].on;
				self.dispmsg(`error setting ${parts} (${code} ${status})`);
			},
			(err, self) => self.dispmsg(`error setting ${parts} (${err})`)
		);
	}
	
	getData(path, on_ok, on_errcode, on_errnet, isloop){
		if (this.netstop){
			if (isloop) this.netloops--; 
			return;
		}
		
		fetch(`http://${this.addr}:8081${path}`, {method: 'GET'})
		.then(res => {
			if (res.ok) res.text().then(txt => on_ok(txt)).catch(err => {
				if (isloop) this.netloops--;
				on_errnet(err); 
				this.toggleNeterror(true);
			});
			else{
				if (isloop) this.netloops--;
				on_errcode(res.status, res.statusText);
				this.toggleNeterror(true);
			}
		})
		.catch(err => {
			if (isloop) this.netloops--;
			on_errnet(err);
			this.toggleNeterror(true);
		});
	}
	getVec2d(parts, msg=false, callback=null, isloop=false){
		let path = '/'+parts.join('/');
		this.getData(
			path, 
			txt => {
				try{
					let [x,y] = txt.split(";");
					let obj = this[parts[0]][parts[1]][parts[2]];
					[obj.x, obj.y] = [Number(x), Number(y)]; 
					if (msg) this.dispmsg(`${path} is (${x};${y})`); 
					if (callback !== null) callback();
				}
				catch (err){ this.dispmsg(`error getting ${path} (${err})`); }
			}, 
			(code, status) => this.dispmsg(`error getting ${path} (${code} ${status})`),
			err            => this.dispmsg(`error getting ${path} (${err})`),
			isloop
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
			false
		);
	}
	
	// sends new request once the answer to the previous one arrives
	getPosLoop(){ this.getVec2d(['move', 'real', 'pos'], false, () => this.getPosLoop(), true); }
	getDirLoop(){ this.getVec2d(['move', 'real', 'dir'], false, () => this.getDirLoop(), true); }
	
	getAll(callback){
		this.netstop = true; // stop the running loops 
		let id = window.setInterval(() => {
			if (this.netloops == 0){
				this.netstop = false;
				
				this.getBool( ['move', 'auto'] );
				this.getBool( ['cannon', 'auto'] );
				this.netloops++; this.getPosLoop();
				this.netloops++; this.getDirLoop();
				
				window.clearInterval(id);
				callback();
			}
		}, 100);
	}
	
	refresh(){
		this.toggleNeterror(false);
		
		// set values
		//getdom(`.div_tank[tankid="${this.id}"] .btn_ok`).forEach(el => el.click());
		//getdom(`.div_tank[tankid="${this.id}"] .check_com`).forEach(el => el.onchange());
		// get values
		this.getAll( ()=>this.dispmsg('connection refreshed') );
	}
	
	draw(){
		ctx.save();
		ctx.fillStyle = this.color;
		ctx.translate(this.move.real.pos.x, this.move.real.pos.y);
		ctx.rotate(-Math.tan(this.move.real.dir.y / this.move.real.dir.x));
		ctx.fill(this.path);
		ctx.restore();
	}
	
	dispmsg(msg){
		msgconsole.innerHTML += `<br>TANK&lt;${this.addr}&gt; <b>::</b> ${msg}`;
	}
}
function addTank(){
	let tank = new Tank();
	tanks.push(tank);
	
	let tankidattr = `tankid="${tank.id}"`;
	
	getdom('#div_tanks')[0].innerHTML += `
		<div class="div_tank" ${tankidattr}>
			<div>
				<b>Tank</b> ${html_inputzone("in_tankaddr", 1, [tank.addr], [tankidattr+" size=6"])} <span class="span_unreachable" ${tankidattr}>unreachable</span>
				<input type="image" src="res/sync.png" onclick="tankfromid(${tank.id}).refresh()" class="btn_refresh"></input>
			</div>
			<input type="checkbox" onchange="toggle_auto(this, 'move');" checked="${tank.move.auto.on}" class="check_com" ${tankidattr}></input>Auto move<br>
			<input type="checkbox" onchange="toggle_auto(this, 'cannon');" checked="${tank.cannon.auto.on}" class="check_com" ${tankidattr}></input>Auto aim
			<div>
				Target pos.: ${html_inputzone(
					"in_targetpos", 2, 
					[tank.move.com.pos[0].toFixed(1), tank.move.com.pos[0].toFixed(1)],
					[tankidattr+" size=2", tankidattr+" size=2"]
				)}
			</div>
			<div>
				<input type="checkbox" onchange="toggle_camerafeed(this);" checked="true"></input>Camera feed:
				<img width=200 style="-webkit-user-select:none;display:block;" ${tankidattr}>
			</div>
		</div>
	`;
}
let tankfromid = id => tanks.find(tank => tank.id == id)
let tankfromnode = node => tankfromid( Number(node.getAttribute('tankid')) );

function in_tankaddr(nodes){ tankfromnode(nodes[0]).setAddr(nodes[0].value); }
function in_targetpos(nodes){ tankfromnode(nodes[0]).setTargetpos(nodes, Number(nodes[0].value), Number(nodes[1].value)); }
function toggle_auto(node, type){ tankfromnode(node).toggleAuto(node, node.checked, type); }
function toggle_camerafeed(node){ getdom('img', node.parentNode)[0].style.display = node.checked ? 'block' : 'none'; }


let fps = 25;
function loop(){
	ctx.clearRect(0,0, canvasW, canvasH);
	tanks.forEach( tank => tank.draw() );
}
window.setInterval(loop, 1000/fps)


/*
TODO:

*/
