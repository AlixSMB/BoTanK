import util

import numpy as np
import cv2
import cv2.aruco as aruco
import pickle
import os
if os.name == 'nt':
	import msvcrt
	def getch():
		return msvcrt.getch().decode('utf-8')
else:
	from getch import getch

#from util import HTTPVideoStream # util.py

# generate charuco board
charuco_cell_size = 0.02; # in meters
print(f"Aruco cell size set as {charuco_cell_size} m, make sure this is correct !")
charuco_nbcells_w = 7
charuco_nbcells_h = 5
aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
aruco_params = aruco.DetectorParameters_create()
charuco_board = aruco.CharucoBoard_create(charuco_nbcells_w, charuco_nbcells_h, charuco_cell_size, charuco_cell_size/2, aruco_dict)

# generate calibration data
#httpvideo = HTTPVideoStream('192.168.1.173', 8080, '/video/mjpeg')
camW = 1280 ; camH = 720
GST_STRING = \
	'nvarguscamerasrc ! '\
	'video/x-raw(memory:NVMM), width={capture_width}, height={capture_height}, format=(string)NV12, framerate=(fraction){fps}/1 ! '\
	'nvvidconv flip-method=0 ! '\
	'video/x-raw, width=(int){width}, height=(int){height}, format=(string)BGRx ! '\
	'videoconvert ! '\
	'video/x-raw, format=(string)BGR ! '\
	'appsink'.format(
			width=camW,
			height=camH,
			fps=30,
			capture_width=camW,
			capture_height=camH
	)
cap = util.VideoCapture(GST_STRING, cv2.CAP_GSTREAMER)
#cap = cv2.VideoCapture(0)
print(f"Video res.: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")

print("Take some shots of the calibration board from different angles:\n's' to take a shot, 'q' to stop")
nbshots = 0

keys_click = {'q': False, 's': False}

corners_shots = None
ids_shots = None
nbmarkers_shots = []

start = True
while True:
	clicked = getch()
	
	#videoframe = cv2.imdecode(np.frombuffer(httpvideo.getFrameImg(), dtype=np.uint8), cv2.IMREAD_COLOR)
	_, videoframe = cap.read()
	cv2.imwrite("test.jpg", videoframe)
	#videoframe = cv2.flip(videoframe, 1)
	#cv2.imshow('videostream', videoframe)
	
	for key in keys_click:
		if clicked == key and not keys_click[key] : keys_click[key] = True
		else : keys_click[key] = False
		
	if keys_click['q'] : break
	elif keys_click['s'] : # take shot
		
		corners, ids, _ = aruco.detectMarkers(videoframe, aruco_dict, parameters=aruco_params)
		
		if ids is not None and len(corners) > 0: 
			nbshots+=1
			if start:
				corners_shots = corners
				ids_shots = ids
				start = False
			else:
				corners_shots =  np.vstack((corners_shots, corners))
				ids_shots     =  np.vstack((ids_shots, ids))
			nbmarkers_shots.append(len(ids))
			print(f"Saved shots: {nbshots}")
		else :
			print(f"Shot did not register any markers...")

print("Computing camera calibration params...")
camera_projerr, camera_matrix, camera_distcoeffs, *_ = aruco.calibrateCameraAruco(
	corners_shots,
	ids_shots,
	np.array(nbmarkers_shots, dtype=int),
	charuco_board, videoframe.shape[:2], None, None
)
print(f"Camera matrix:\n{camera_matrix}")
print(f"Dist. coeffs.:\n{camera_distcoeffs}")

i=1
filename = f"camera_calibration_params_"
while os.path.exists(filename+str(i)) : i+=1
filename += str(i)

with open(filename, "wb") as filecamera : pickle.dump({"matrix": camera_matrix, "coeffs": camera_distcoeffs}, filecamera, 0)
print(f"Camera calibration params written to \"{filename}\"")
