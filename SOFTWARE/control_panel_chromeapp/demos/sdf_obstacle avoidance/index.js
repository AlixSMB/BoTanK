'use strict';

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

let canvas = getdom('canvas')[0];
let ctx = canvas.getContext('2d');
let canvasW = canvas.width; let canvasH = canvas.height;

let convert_mouse_pos_px = ev =>{
	let canvasRect = canvas.getBoundingClientRect();
	return [ ev.pageX - canvasRect.left, ev.pageY - canvasRect.top ];
};
canvas.addEventListener("mousemove", ev => {
	
	ctx.save();
	ctx.setTransform(1, 0, 0, 1, 0, 0);
	ctx.clearRect(0, 0, canvasW, canvasH);
	ctx.restore();
	
	let rects = [
		100, 100, 300, 200,
		200, 300, 300, 400
	];
	let target = [500, 400];
	let speed = 100;
	let pos = convert_mouse_pos_px(ev);
	
	ctx.fillRect(target[0], target[1], 10, 10);
	
	let vel = [target[0]-pos[0], target[1]-pos[1]];
	let veldist = Math.sqrt( vel[0]**2 + vel[1]**2 );
	vel[0] *= speed/veldist; vel[1] *= speed/veldist;
	
	for (let i=0; i<rects.length; i+=4){
		
		ctx.beginPath();
		ctx.rect(rects[i], rects[i+1], rects[i+2]-rects[i], rects[i+3]-rects[i+1]);
		ctx.stroke();
		
		let orig = [ Math.max(rects[i], Math.min(pos[0], rects[i+2])), Math.max(rects[i+1], Math.min(pos[1], rects[i+3])) ];
		let rectdir = [pos[0]-orig[0], pos[1]-orig[1]];
		let rectdist = Math.sqrt( rectdir[0]**2 + rectdir[1]**2 );
		rectdir[0] /= rectdist; rectdir[1] /= rectdist;
		
		let w = 30*speed; // weight of obstacle avoidance
		vel = [ vel[0] + rectdir[0]*w/rectdist, vel[1] + rectdir[1]*w/rectdist ];
		veldist = Math.sqrt( vel[0]**2 + vel[1]**2 );
		vel[0] *= speed/veldist; vel[1] *= speed/veldist;
	}
	
	ctx.beginPath();
	ctx.moveTo(pos[0], pos[1]);
	ctx.lineTo(pos[0]+vel[0], pos[1]+vel[1]);
	ctx.stroke();
	
});

