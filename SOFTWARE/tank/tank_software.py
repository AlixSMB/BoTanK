# Note for windows CMD: if QuickEdit mode is enabled, clicking the console freezes the script until a keyboard key is pressed... 

from util import * # util.py
from positioning import getBoardTransform, auto_make_board # positioning.py

import cv2
from cv2 import aruco
import numpy as np
#from adafruit_motorkit import MotorKit
#kit = MotorKit()
kit = Object(motor1=Object(throttle=0), motor2=Object(throttle=0))
import math
import time
import pickle

# load camera data
CAMERADATA_FILENAME = "laptopcam_fisheye_params_2" 
print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)

# receive camera feed
camW = 1280
camH = 720
cam_sendS = 0.5
cam_quality = 75
cam_sendW = round(cam_sendS*camW)
cam_sendH = round(cam_sendS*camH)
GST_STRING = \
	'nvarguscamerasrc ! '\
	'video/x-raw(memory:NVMM), width={capture_width}, height={capture_height}, format=(string)NV12, framerate=(fraction){fps}/1 ! '\
	'nvvidconv ! '\
	'video/x-raw, width=(int){width}, height=(int){height}, format=(string)BGRx ! '\
	'videoconvert ! '\
	'video/x-raw, format=(string)BGR ! '\
	'appsink drop=true'.format(
			width=camW,
			height=camH,
			fps=60,
			capture_width=camW,
			capture_height=camH
	)
#cap = cv2.VideoCapture(GST_STRING, cv2.CAP_GSTREAMER) #VideoCapture(GST_STRING, cv2.CAP_GSTREAMER) # from util.py [!]
cap = cv2.VideoCapture(0)
#cap.set(cv2.CAP_PROP_EXPOSURE, -4) # set to 0.25 auto-adjust
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000);

print(f"Video res.: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")
print(f"Video FPS: {cap.get(cv2.CAP_PROP_FPS)}")
#print(f"Video exposure: {cap.get(cv2.CAP_PROP_EXPOSURE)}")

ADDR_CTRLPANEL = "127.0.0.1"#"192.168.43.75"
print(f"Control panel IP set to {ADDR_CTRLPANEL}")
PORT_CAM = 8081
PORT_OPTS = 8082
PORT_COMS_IN = 8082
PORT_COMS_OUT = 8083
HEARTBEAT_MAXTIME = 3
net = Object(
	out_cam = UDP(ADDR_CTRLPANEL, None, PORT_CAM),
	inout_move = UDP(ADDR_CTRLPANEL, PORT_COMS_IN, PORT_COMS_OUT),
	server_opts = TCPServer(ADDR_CTRLPANEL, PORT_OPTS, HEARTBEAT_MAXTIME)
)

aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
current_mobj = None

''' data is like:
 udp: 
 	move,com,vel;0.3201,0.9732
 	cannon,com,yaw;0.326
	...
 tcp request:
	GET
	move,real,pos
	move,real,dir

	SET
	move,auto,on;1
	
	...
 tcp response:
	move,real,pos
	move,real,dir

	OK
	
	...
note: the empty lines serve to delimit different messages 
'''
def recv_setdata(lines):
	for line in lines:
		if line == '' : continue
		path, vals = [el.split(',') for el in line.split(';')]
		
		obj = dict_get(data, path)
		if path[-1] == 'on' : obj.onchange(True if vals[0] == '1' else False)
		else:
			try: # number(s) ?
				for i in range(len(vals)) : vals[i] = float(vals[i])
			except : pass
			if len(vals) == 1 : obj.onchange(vals[0])
			else              : obj.onchange(vals)
def recv_move_data(server):
	msg = server.recv()
	while msg is not None:
	#if msg is not None:
		recv_setdata(msg.decode('ascii').split('\n'))
		msg = server.recv()
def recv_opts_data(server):
	msg = server.recv()
	if msg is None : return
	while msg[-2:] != b'\n\n' : msg += server.recv()
	
	for part in msg.decode('ascii').split('\n\n'):
		if part == '' : continue
		
		lines = part.split('\n')
		
		if lines[0] == 'HEARTBEAT':
			server.send(b'OK\n\n')
		
		elif lines[0] == 'GET':
			res = ''
			for line in lines[1:]:
				if line == '' : continue
				
				path = line.split(',')
				obj = dict_get(data, path)
				
				if path[-1] == 'on' : res += f"{line};{'1' if obj.val else '0'}\n"
				else:
					if isinstance(obj.val, list) : res += f"{line};{ ','.join([str(el) for el in obj.val]) }\n"
					else                         : res += f"{line};{str(obj.val)}\n"
			server.send( (res+'\n').encode('ascii') )
			
		elif lines[0] == 'SET':
			recv_setdata(lines[1:])
			server.send(b'OK\n\n')
		
		elif lines[0] == 'SETMARKERS':
			mids = []
			cornersAll = []
			for line in lines[1:]:
				if line == '' : continue
				mtype, mid, corners = line.split(';;');
				mids.append(int(mid))
				cornersAll.append([ [float(val) for val in corner.split(',')] for corner in corners.split(';') ])
				
			data['markers'][mtype].onchange(mtype, mids, cornersAll)
			server.send(b'OK\n\n')
		
		elif lines[0] == 'DO':
			
			if lines[1] == 'SNAPAUTOBOARD':
				if auto_make_board(
					cameradata, camera_frame, data['markers']['auto'], 
					data['markers']['auto_s'].val, aruco_dict, data['markers']['ids_range'].val
				):
					send_auto_markers()
				server.send(b'OK\n\n')
			
			elif lines[1] == 'RESETAUTOBOARD':
				reset_auto_board()
				server.send(b'OK\n\n')
			
			elif lines[1] == 'STARTMOVEAUTO':
				startMoveAuto()
				server.send(b'OK\n\n')
			
			elif lines[1] == 'STOPMOVEAUTO':
				stopMoveAuto()
				server.send(b'OK\n\n')
			
			else :
				console.log(f"Received unknown \"DO\" request \"{lines[0]}\"")
				server.send(b'ERR\n\n')	
		
		else :
			console.log(f"Received unknown opts request \"{lines[0]}\"")
			server.send(b'ERR\n\n')
def send_move_data(server):	
	msg = ''
	
	for key1 in ['move', 'cannon']:
		part = data[key1]['real']
		for key2 in part:
			obj = part[key2]
			
			if key2 == 'on' : msg += f"{key1},real,{key2};{'1' if obj.val else '0'}\n"
			else:
				if isinstance(obj.val, (list, np.ndarray)) : msg += f"{key1},real,{key2};{ ','.join([str(el) for el in obj.val]) }\n"
				else                         : msg += f"{key1},real,{key2};{str(obj.val)}\n"
	
	msg += f"obstacles,marked,obj;{ ','.join([str(el) for el in data['obstacles']['marked']['obj']]) }\n"
	
	server.send(msg.encode('ascii'))
def send_auto_markers():
	msg = "SETAUTOMARKERS\n"
	mids = list(data['markers']['auto'].cells.keys())
	cornersAll = list(data['markers']['auto'].cells.values())
	for i in range(len(mids)) : msg += str(mids[i]) + ";;" + str.join(';', [str.join(',', [str(el) for el in corner]) for corner in cornersAll[i]]) + '\n';
	net.server_opts.send( (msg+'\n').encode('ascii') )
def send_current_trajpnt():
	net.server_opts.send( f"SETCURRENTTRAJPNT\n{data['move']['auto']['current_trajpnt'].val}\n\n".encode('ascii') )
# update data from coms channel (remote)
def update_data(self, val):
	self.val = val
def update_move_vel(self, vel, fromprog=False):
	if not data['move']['auto']['on'].val:
		set_move_vel(vel)
		self.val = vel
		if not fromprog : timeouts['check_movedata'].refresh()
def toggle_move_auto(self, on):
	if on : timeouts['check_movedata'].disable()
	else :
		stopMoveAuto()
		timeouts['check_movedata'].enable()
	
	kit.motor1.throttle = 0
	kit.motor2.throttle = 0
	self.val = on
def toggle_canon_auto(self, on):
	self.val = on
def update_markers_type(self, mtype):
	global current_mobj
	self.val = mtype
	current_mobj = data['markers'][mtype]
	if mtype == 'auto' : send_auto_markers()
def update_markers(self, mtype, mids, cornersAll):
	for i in range(len(mids)) : self.cells[mids[i]] = cornersAll[i]
	self.board = aruco.Board_create(np.asarray(list(self.cells.values()), np.float32), aruco_dict, np.asarray(list(self.cells.keys()), int))
def update_pos_markers_range(self, mrange):
	self.val = mrange
	reset_auto_board()
def update_auto_markers_size(self, msize):
	self.val = msize
	reset_auto_board()
def update_current_trajpnt(ind):
	# tank has reached last point
	if pid*2 == len(data['move']['auto']['trajectory'].val) : stopMoveAuto()
	else:
		self.val = ind
		send_current_trajpnt()
def update_obst_markers_range(self, mrange):
	self.val = mrange
	reset_auto_board()

def set_move_vel(vel):
	vel[1] *= -1
	data['move']['real']['vel'].val = vel
	kit.motor1.throttle = 0.9 if vel[0] > 0.9 else (-0.9 if vel[0] < -0.9 else vel[0]) 
	kit.motor2.throttle = 0.9 if vel[1] > 0.9 else (-0.9 if vel[1] < -0.9 else vel[1])

# sdf_vect_* return direction and signed distance 
def sdf_vect_rect(r, px,py): # rotated rectangle
	# local axes of rect.
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
def sdf_vect_circ(cx,cy,r, px,py):
	# point on circle surface closest to pos
	circleDir = [px-cx, py-cy]
	circleDist = math.sqrt(circleDir[0]**2 + circleDir[1]**2)
	circleDir[0] /= circleDist ; circleDir[1] /= circleDist
	return (circleDir, circleDist-r)
def sdf_vect_line(l1x,l1y, l2x,l2y, px,py):
	linePntDir = [px-l1x, py-l1y]
	lineAxis = [l2x-l1x, l2y-l1y]
	lineSize = math.sqrt( lineAxis[0]**2 + lineAxis[1]**2 )
	lineAxis[0] /= lineSize ; lineAxis[1] /= lineSize
	
	projPos = linePntDir[0]*lineAxis[0] + linePntDir[1]*lineAxis[1]
	local_orig = clamp(0, lineSize, projPos)
	
	orig = [
		l1x + lineAxis[0]*local_orig,
		l1y + lineAxis[1]*local_orig
	]
	lineDir = [px-orig[0], py-orig[1]]
	lineDist = math.sqrt( lineDir[0]**2 + lineDir[1]**2 )
	lineDir[0] /= lineDist ; lineDir[1] /= lineDist
	return (lineDir, lineDist)

minDistTarget = 0.03 # 3cm around target means the destination is reached
slowDownDist = 0.08 # start slowing down at this distance to target
def auto_goto_point(target):
	dirTarget = [target[0]-transfo[0][0], target[1]-transfo[0][1]]
	distTarget = math.sqrt( dirTarget[0]**2 + dirTarget[1]**2 )
	
	if distTarget <= minDistTarget : return True # we have arrived at target
	
	# slow down if near target
	#if distTarget >= slowDownDist : speed = min( speed, max(0.15, distTarget/slowDownDist*0.5) )
	
	# X, Y axes of tank
	tankY = transfo[1]
	tmp = tankY[0]**2 + tankY[1]**2
	tankX = [tankY[1]/tmp, -tankY[0]/tmp]
	# projection of target on those axes
	targetX = dirTarget[0]*tankX[0] + dirTarget[1]*tankX[1]
	targetY = dirTarget[0]*tankY[0] + dirTarget[1]*tankY[1]
	velX = targetX*speed/distTarget ; velY = targetY*speed/distTarget
	
	speed = data['move']['auto']['speed'].val
	
	# TODO: rotated rectangle and lines
	# influence of obstacles on vel
	rects = data['obstacles']['virtual']['rects'].val # rectangular virtual obstacles
	w = data['obstacles']['virtual']['w']*speed # obstacle weight
	for i in range(len(rects)):
		# point on rect surface closest to tank
		origX = max(rects[i], min(transfo[0][0], rects[i+2]))
		origY = max(rects[i+1], min(transfo[0][1], rects[i+3]))
		
		rectdirX = transfo[0][0] - origX
		rectdirY = transfo[0][1] - origY
		rectdist = math.sqrt(rectdirX**2 + rectdirY**2)
		rectdirX /= rectdist
		rectdirY /= rectdist
		
		velX += rectdirX * w/rectdist # influence of obstacle is inversly
		velY += rectdirY * w/rectdist # proportional to distance
		veldist = math.sqrt(velX**2 + velY**2)
		velX *= speed/veldist
		velY *= speed/veldist
	
	# almost same as the corresponding gamepad javascript code
	angle = math.atan2(velY, velX)
	if angle >= -math.pi/2 and angle <= math.pi/2 : set_move_vel([velY, speed])
	else                                          : set_move_vel([speed, velY])
	
	return False # not at target yet
	
def startMoveAuto():
	if data['move']['auto']['on'].val : data['move']['auto']['run'] = True
	if data['move']['auto']['type'].val == 'trajectory':
		data['move']['auto']['current_trajpnt'].val = 0
		send_current_trajpnt()
def stopMoveAuto():
	data['move']['auto']['run'] = False
	set_move_vel([0,0])
def auto_move():
	if not data['move']['auto']['run'] : return
	
	if data['move']['auto']['type'].val == 'target':
		if auto_goto_point(data['move']['auto']['target'].val) : stopMoveAuto()
	else: # trajectory
		ind = data['move']['auto']['current_trajpnt'].val
		if auto_goto_point(data['move']['auto']['trajectory'].val[ind*2:(ind+1)*2]):
			data['move']['auto']['trajectory'].onchange(ind+1)

def reset_auto_board():
	global current_mobj
	
	data['markers']['auto'] = newAutoBoard()
	if data['markers']['type'].val == 'auto':
		current_mobj = data['markers']['auto']
		send_auto_markers() # will send empty list of markers
def newAutoBoard():
	return Object(
		cells = {}, cells_tmp = {}, cells_i = {}, # cells contains cells positioned relative to origin with smallest id, cells_tmp contains all cells
		board = None,                             # cells_i = cells info (in_refs, out_ref, etc..., ms = marker size, orig = origin id 
		orig = 9999
	)

data = {
	'move': {
		'com': { # command
			'pos': Object(val=[0,0], onchange=update_data),
			'dir': Object(val=[0,0], onchange=update_data),
			'vel': Object(val=[0,0], onchange=update_move_vel)
		},
		'real': { # actual value
			'pos': Object(val=[0,0]),
			'dir': Object(val=[1,0]), # 0°
			'vel': Object(val=[0,0])
		},
		'auto': { # automatic mode
			'on': Object(val=False, onchange=toggle_move_auto),
			'type': Object(val='target', onchange=update_data),
			
			'run': False,
			
			'target': Object(val=[0,0], onchange=update_data),
			'trajectory': Object(val=[], onchange=update_data),
			'current_trajpnt': Object(val=0, onchange=update_current_trajpnt), # start point and end point of this segment
			
			'speed': Object(val=0.3, onchange=update_data) 
		}
	},
	'cannon': {
		'com': {
			'yaw': Object(val=0, onchange=update_data),
			'pitch': Object(val=0, onchange=update_data)
		},
		'real': {
			'yaw': Object(val=0),
			'pitch': Object(val=0)
		},
		'auto': {'on': Object(val=False, onchange=toggle_canon_auto),}
	},
	'markers': {
		'type': Object(val='auto', onchange=update_markers_type),
		
		'ids_range': Object(val=[0, 200], onchange=update_pos_markers_range),
		
		'auto_s': Object(val=0.035, onchange=update_auto_markers_size), # 3.5 centimeters by default, modifiable by control panel
		'auto': newAutoBoard(),
		
		'grid': Object(cells={}, board=None, onchange=update_markers) 
	},
	'obstacles': {
		'virtual': {
			'rects': Object(val=[], onchange=update_data),
			'lines': Object(val=[], onchange=update_data),
			'w': 30, # "weight" of virtual obstacle
		},
		'marked': {
			'obj': [],
			'ids_range': Object(val=[201, 249], onchange=update_obst_markers_range),
			'w': 30,
			's': Object(val=0.05, onchange=update_data),
			'n': Object(val=6, onchange=update_data), # max number of markers per obstacle
			'collider': Object(val='AABB', onchange=update_data) # bounding shape of the obstacles
	}
};

timeouts = {
	'check_movedata': Timeout(1, partial(data['move']['com']['vel'].onchange, [0,0], True)) # set vel to 0 if we don't receive move data for extended amount of time and move is set to manual
}
if not data['move']['auto']['on'].val : timeouts['check_movedata'].enable()

set_timer('stream_imgframe', 1/11) # 11 fps
set_timer('movedata', 1/10) # 10 fps
transfo = None
while True:
	timers_start()

	# read new camera frame
	if check_timer('movedata'):	
		ret, camera_frame = cap.read()
		if not ret: 
			print("Camera error, quitting...")
			cap.release()
			break
		
		camera_frame = fisheye_undistort(cameradata, camera_frame)
		
		# compute tank pos, speed
		if current_mobj is not None:
			transfo = getBoardTransform(cameradata, camera_frame, current_mobj.board, aruco_dict, transfo)
			if transfo is not None:
				data['move']['real']['pos'].val = transfo[0][:2]
				data['move']['real']['dir'].val = transfo[1]
				
				data['obstacles']['marked']['obj'] = getMarkedObstacles(
					cameradata, camera_frame, aruco_dict, 
					data['obstacles']['marked']['ids-range'].val, data['obstacles']['marked']['s'].val, 
					data['obstacles']['marked']['n'].val, data['obstacles']['marked']['collider'].val, transfo
				)
				if data['move']['auto']['on'].val : auto_move()
	
	# stream camera
	if check_timer('stream_imgframe'):
		camera_jpegbytes = cv2.imencode('.jpeg', cv2.resize(camera_frame, (cam_sendW,cam_sendH)), [int(cv2.IMWRITE_JPEG_QUALITY), cam_quality])[1].tobytes()
		net.out_cam.send(camera_jpegbytes)
	
	net.server_opts.checkdead() # will disconnect if remote connection hasn't sent data in a while
	net.server_opts.connect() # will accept a connection if none is already established
	
	# handle received move message
	recv_move_data(net.inout_move)
	# handle received opts message
	recv_opts_data(net.server_opts)
	
	# send move messages
	if check_timer('movedata'):
		send_move_data(net.inout_move)
	
	
	#if cv2.waitKey(1) == ord('q') : break
	timers_end()
	for key in timeouts : timeouts[key].check()


# TODO:

#	- Ajouter code obstacles via camera
#	- aruco coded obstacles:
#		- boxes, one marker per vertical face -> forms a board
#		- range of ids are declared in use for obstacles, another range for map positioning
#		- boxes can be registered: like auto_board
#	- unmarkerd obstacles:
#		- use cynlinders of knwon size, get bounding rect, get image corners, solvpnp
#		-> ex: cardboard roll
#	- use getBoardObjectAndImagePoints and solvePnP instead of estimatePoseBoard ?
# 	- optimize code:
#		- for ... in list(...dict...)
#		- use dict for url dispatcher ?
#	- handle timers differently ?
