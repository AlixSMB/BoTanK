'use strict';

let getdom = (str, el=document) => [...el.querySelectorAll(str)];
let uniqueid = (function(){
	let tmp = 0;
	return function(){ return ++tmp; }
})();

function resetNodesVals(nodes){ nodes.forEach(node => node.value = node.getAttribute('oldvalue')); }
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
					nodes.forEach(node => node.setAttribute('oldvalue', node.value));
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

let tanks = [];
class Tank{
	constructor( addr="localhost" ){
		this.move = {
			com: { // command
				pos: { x: 0, y: 0 },
				dir: { x: 0, y: 0 },
				vel: { x: 0, y: 0 }
			},
			real: { // actual value
				pos: { x: 0, y: 0 },
				dir: { x: 0, y: 0 },
				vel: { x: 0, y: 0 }
			},
			auto: { // automatic mode
				on: false,
				target: {x: 0, y: 0}
			}
		};
		this.cannon = {
			com: {
				yaw: 0,
				pitch: 0
			},
			real: {
				yaw: 0,
				pitch: 0
			},
			auto: false
		};
		
		this.id = uniqueid();
		this.addr = addr;
	}
	
	setAddr(addr){
		this.addr = addr;
		getdom(`img[tankid="${this.id}"]`)[0].src = `http://${this.addr}:8080/video/mjpeg`;
	}
	
	setData(path, data, on_ok, on_errcode, on_errnet){
		let self = this;
		fetch(`http://${this.addr}:8081${path}`, {method: 'PUT', body: data})
		.then(res => {
			if (res.ok) on_ok(self);
			else on_errcode(res.status, res.statusText, self);
		})
		.catch( err => on_errnet(err, self) );
	}
	setVec2d(nodes, x, y, path, typestr, obj){
		this.setData(
			path, `${x.toFixed(1)};${y.toFixed(1)}`, 
			self => {
				obj.x = x; obj.y = y;
				self.dispmsg(`${typestr} set to (${x};${y})`);
			}, 
			(code, status, self) => {
				if (nodes !== null) resetNodesVals(nodes);
				self.dispmsg(`Error setting ${typestr} (${code} ${status})`);
			},
			(err, self) => self.dispmsg(`Error setting ${typestr} (${err})`)
		);
	}
	setVel(x, y){              this.setVec2d(null,  x, y, '/move/vel',            'velocity',    this.move.com.vel    ); }
	setTargetpos(nodes, x, y){ this.setVec2d(nodes, x, y, '/move/auto/targetpos', 'target pos.', this.move.auto.target); }
	toggleTargetpos(node, on){
		this.setData(
			`/move/auto/${on ? 'on' : 'off'}`, '', 
			self => {
				self.move.auto.on = on;
				self.dispmsg(`Autonomous movement ${on ? 'enabled' : 'disabled'}`);
			}, 
			(code, status, self) => {
				node.checked = self.move.auto.on;
				self.dispmsg(`Error ${on ? 'enabling' : 'disabling'} autonomous movement (${code} ${status})`);
			},
			(err, self) => self.dispmsg(`Error ${on ? 'enabling' : 'disabling'} autonomous movement (${err})`)
		);
	}
	
	
	refresh(){
		getdom(`.div_tank[tankid="${this.id}"] .btn_ok`).forEach(el => el.click());
		getdom(`.div_tank[tankid="${this.id}"] .check_com`).forEach(el => el.onchange());
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
				Tank ${html_inputzone("in_tankaddr", 1, [tank.addr], [tankidattr+" size=6"])}
				<input type="image" src="res/sync.png" onclick="tankfromid(${tank.id}).refresh()" class="btn_refresh"></input>
			</div>
			<div>
				<input type="checkbox" onchange="toggle_targetpos(this);" checked="${tank.move.auto.on}" class="check_com" ${tankidattr}></input>
				Target pos.: ${html_inputzone(
					"in_targetpos", 2, 
					[tank.move.com.pos.x.toFixed(1), tank.move.com.pos.y.toFixed(1)],
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
function toggle_targetpos(node){ tankfromnode(node).toggleTargetpos(node, node.checked); }
function toggle_camerafeed(node){ getdom('img', node.parentNode)[0].style.display = node.checked ? 'block' : 'none'; }
