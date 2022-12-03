'use strict';

let getdom = (el=document, str) => el.getQuerySelectorAll(str);
function uniqueid(){
	if (this.val === undefined) this.val = 0;
	this.val += 1;
	return this.val;
}

let html_inputzone = (on_ok, n=1, values=null, attrs=null, sep="<b>;</b>") => {
	let n = attrs.length;
	let inputs = [...Array(n).keys()].map(ind => 
		`<input 
			type="text" 
			${ attrs === null ? "" : ${attrs[ind]} } 
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
			com = { // command
				pos = { x=0, y=0 },
				dir = { x=0, y=0 },
				vel = { x=0, y=0 }
			},
			real = { // actual value
				pos = { x=0, y=0 },
				dir = { x=0, y=0 },
				vel = { x=0, y=0 }
			},
			auto = { // automatic mode
				on = false,
				target = {0, 0}
			}
		};
		this.canon = {
			com = {
				yaw = 0,
				pitch = 0
			},
			real = {
				yaw = 0,
				pitch = 0
			},
			auto = false
		};
		
		this.id = uniqueid();
		this.addr = addr;
	}
	
	setAddr(addr){
		this.addr = addr;
		//getdom()
	}
	setTargetpos
}
function addTank(){
	let tank = Tank();
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
				Camera feed:
				<img
			</div>
		</div>
	`;
}
