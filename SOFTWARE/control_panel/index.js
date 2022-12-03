'use strict';

let getdom = (el=document, str) => el.querySelectorAll(str);

let uniqueid = (function(){
	let tmp = 0;
	return function(){ return ++tmp; }
})();

let html_inputzone = (on_ok, n=1, values=null, attrs=null, sep="<b>;</b>") => {
	let inputs = [...Array(n).keys()].map(ind => 
		`<input 
			type="text" 
			${ attrs === null ? "" : attrs[ind] } 
			${ values === null ? "value='' oldvalue=''" : `value="${values[ind]}" oldvalue="${values[ind]}"` } 
			onchange="this.parentNode.style.display = 'inline';
		"></input>
	`).join(sep);
	
	return `
		<div class="div_inputzone" style="display:none;">
			${inputs}<!--
			--><div class="div_inbtnctls">
				<input type="button" class="btn_ok" value="ok" onclick="
					let nodes = getdom(this.parentnode.parentnode, 'input').splice(0, ${n});
					${on_ok}(nodes);
					nodes.forEach(node => node.setAttribute('oldvalue', node.value));
					this.parentNode.style.display = none;
				"></input>
				<input type="button" class="btn_cancel" value="X" onclick="
					getdom(this.parentnode.parentnode, 'input').splice(0, ${n}).forEach(node => node.value = node.getAttribute('oldvalue'));
					this.parentNode.style.display = none;
				"></input>
			</div>
		</div>
	`;
	
};

let tanks = [];
class Tank{
	constructor( addr="?addr?" ){
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
		this.canon = {
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
	setTargetpos(x, y){
		console.log("target pos set");
		// GET...
	}
	toggleTargetpos(on){
		console.log("target pos toggle");
	}
}
function addTank(){
	let tank = new Tank();
	tanks.push(tank);
	
	let tankidattr = `tankid="${tank.id}"`;
	
	getdom('#div_tanks')[0].innerHTML += `
		<div class="div_tank">
			<div>Tank ${html_inputzone("in_tankaddr", [tank.addr], [tankidattr])}</div>
			<div>
				<input type="checkbox" onchange="toggle_targetpos(this);" checked="${tank.move.auto.on}"></input>
				Target pos.: ${html_inputzone(
					in_targetpos, 2, 
					[tank.mov.com.pos.x.toFixed(1), tank.mov.com.pos.y.toFixed(1)],
					[tankidattr, tankidattr]
				)}
			</div>
			<div>
				<input type="checkbox" onchange="toggle_camerafeed(this);" checked="true"></input>Camera feed:
				<img width=200 style="-webkit-user-select:none;display:inline;" ${tankidattr}>
			</div>
		</div>
	`;
}
let tankfromnode = node => tanks.find( tank => tank.id == Number(node.getAttribute('tankid')) );

function in_tankaddr(nodes){ tankfromnode(nodes[0]).setAddr(nodes[0].value); }
function in_targetpos(nodes){ tankfromnode(nodes[0]).setTargetpos( Number(nodes[0].value), Number(nodes[1].value) ); }
function toggle_targetpos(node){ tankfromnode(nodes[0]).toggleTargetpos(node.checked); }
function toggle_camerafeed(node){
	getdom(node.parentNode, 'img')[0].style.display = node.checked ? 'inline' : 'none';
}
