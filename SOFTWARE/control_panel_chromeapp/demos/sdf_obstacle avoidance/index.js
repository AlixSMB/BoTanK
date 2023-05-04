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

let clamp = (a,b,x) => Math.max(a, Math.min(x, b));

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
		100, 100, 100, 200, 300, 200, 300, 100,
		300,300, 200,400, 300,500, 400,400
	];
	let circles = [
		500, 400, 30
	];
	let lines = [
		450, 200, 500, 150
	];
	let target = [550, 300];
	let speed = 100;
	let pos = convert_mouse_pos_px(ev);
	
	ctx.fillRect(target[0], target[1], 10, 10);
	
	let vel = [target[0]-pos[0], target[1]-pos[1]];
	let veldist = Math.sqrt( vel[0]**2 + vel[1]**2 );
	vel[0] *= speed/veldist; vel[1] *= speed/veldist;
	
	for (let i=0; i<rects.length; i+=8){
		ctx.beginPath();
		ctx.moveTo(rects[i], rects[i+1]);
		for (let n=0; n < 8; n+=2) ctx.lineTo(rects[i+n], rects[i+n+1]);
		ctx.closePath();
		ctx.stroke();
		
		// local axes of rect.
		let rX = [rects[i+6]-rects[i], rects[i+7]-rects[i+1]];
		let rXdist = Math.sqrt(rX[0]**2 + rX[1]**2);
		rX[0] /= rXdist; rX[1] /= rXdist;
		let rY = [rects[i+2]-rects[i], rects[i+3]-rects[i+1]];
		let rYdist = Math.sqrt(rY[0]**2 + rY[1]**2);
		rY[0] /= rYdist; rY[1] /= rYdist;
		// project point to rect. coords
		let rectPntDir = [pos[0]-rects[i], pos[1]-rects[i+1]];
		let projPosX = rectPntDir[0]*rX[0] + rectPntDir[1]*rX[1];
		let projPosY = rectPntDir[0]*rY[0] + rectPntDir[1]*rY[1];
		// same as axis aligned sdf_vect for rectangles, but we project orig back from local rect. coords to global coords
		// orig_local => rectO + a*rectX + b*rectY
		let local_orig = [clamp(0, rXdist, projPosX), clamp(0, rYdist, projPosY)];
		let orig = [ 
			rects[i]   + local_orig[0]*rX[0] + local_orig[1]*rY[0],
			rects[i+1] + local_orig[0]*rX[1] + local_orig[1]*rY[1]
		];
		ctx.fillRect(orig[0]-3, orig[1]-3, 6, 6);
		
		let rectdir = [pos[0]-orig[0], pos[1]-orig[1]];
		let rectdist = Math.sqrt( rectdir[0]**2 + rectdir[1]**2 );
		rectdir[0] /= rectdist; rectdir[1] /= rectdist;
		
		let w = 30*speed; // weight of obstacle avoidance
		vel = [ vel[0] + rectdir[0]*w/rectdist, vel[1] + rectdir[1]*w/rectdist ];
		veldist = Math.sqrt( vel[0]**2 + vel[1]**2 );
		vel[0] *= speed/veldist; vel[1] *= speed/veldist;
	}
	for (let i=0; i<circles.length; i+=3){
		ctx.beginPath();
		ctx.arc(circles[i], circles[i+1], circles[i+2], 0, 2*Math.PI);
		ctx.stroke();
		
		let circledir = [ pos[0]-circles[i], pos[1]-circles[i+1] ];
		let circledist = Math.sqrt(circledir[0]**2 + circledir[1]**2);
		circledir[0] /= circledist; circledir[1] /= circledist;
		circledist -= circles[i+2];
		ctx.fillRect(circles[i]+circledir[0]*circles[i+2]-3, circles[i+1]+circledir[1]*circles[i+2]-3, 6, 6);
		
		let w = 30*speed; // weight of obstacle avoidance
		vel = [ vel[0] + circledir[0]*w/circledist, vel[1] + circledir[1]*w/circledist ];
		veldist = Math.sqrt( vel[0]**2 + vel[1]**2 );
		vel[0] *= speed/veldist; vel[1] *= speed/veldist;
	}
	for (let i=0; i<lines.length; i+=4){
		ctx.beginPath();
		ctx.moveTo(lines[0], lines[1]);
		ctx.lineTo(lines[2], lines[3]);
		ctx.stroke();
		
		let linePntDir = [pos[0]-lines[0], pos[1]-lines[1]];
		let lineAxis = [lines[2]-lines[0], lines[3]-lines[1]];
		let lineSize = Math.sqrt( lineAxis[0]**2 + lineAxis[1]**2 );
		lineAxis[0] /= lineSize; lineAxis[1] /= lineSize;
		let projPos = linePntDir[0]*lineAxis[0] + linePntDir[1]*lineAxis[1];
		let local_orig = clamp(0, lineSize, projPos);
		let orig = [
			lines[0]+lineAxis[0]*local_orig,
			lines[1]+lineAxis[1]*local_orig
		];
		ctx.fillRect(orig[0]-3, orig[1]-3, 6, 6);
		
		let lineDir = [pos[0]-orig[0], pos[1]-orig[1]];
		let lineDist = Math.sqrt( lineDir[0]**2 + lineDir[1]**2 );
		lineDir[0] /= lineDist; lineDir[1] /= lineDist;
		
		let w = 30*speed; // weight of obstacle avoidance
		vel = [ vel[0] + lineDir[0]*w/lineDist, vel[1] + lineDir[1]*w/lineDist ];
		veldist = Math.sqrt( vel[0]**2 + vel[1]**2 );
		vel[0] *= speed/veldist; vel[1] *= speed/veldist;
	}
	
	ctx.beginPath();
	ctx.moveTo(pos[0], pos[1]);
	ctx.lineTo(pos[0]+vel[0], pos[1]+vel[1]);
	ctx.stroke();
	
});

