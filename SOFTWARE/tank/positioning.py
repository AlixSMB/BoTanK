import util # util.py
Object = util.Object

import numpy as np
import cv2
import cv2.aruco as aruco
import math

detect_params = aruco.DetectorParameters_create()

# generate corners and isd automatically from frames, using relative distances between markers
def auto_make_board(videoframe, board):
	pass

# get pos / rot of camera relative to board, the video frame should be distorsion free ! 
def getBoardTransform(cameradata, videoframe, board, dictio):
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		
		corners, ids, _,_ = aruco.refineDetectedMarkers(videoframe, board, corners, ids, rejectedCorners)
		nb_markers, rvec, tvec = aruco.estimatePoseBoard(corners, ids, board, cameradata['matrix'], cameradata['coeffs'], None, None)
		
		if nb_markers > 0:
			aruco.drawDetectedMarkers(videoframe, corners, ids)
			cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvec, tvec, 1)
			
			# get rotation matrix from rotation vector
			rmat = cv2.Rodrigues(rvec)[0]
			# get inverse of rotation matrix: inv(R) = transpose(R)
			invRMat = np.transpose(rmat)
			# get inverse of tranformation matrix (rotation + translation)
			# we use a fast method: https://stackoverflow.com/questions/2624422/efficient-4x4-matrix-inverse-affine-transform
			invTransfo = np.zeros((4,4), np.float32)
			invTransfo[3,3] = 1
			invTransfo[0:3, 0:3] = invRMat
			invTransfo[0:3, 3] = np.matmul(-invRMat, tvec[:,0])
			
			# get cam pos (transform [0,0,0] from cam coords to board coords)
			cam_pos = np.matmul(invTransfo, np.array([0,0,0,1]))
			
			# get cam rotation around board z
			# transform the optical axis (vector [0,0,1]) from cam coords to board coords
			cam_forward = np.matmul(invTransfo, np.array([0,0,1,1], np.float32)) - cam_pos
			# project unto (x,y) plane of board
			cam_dir = np.array([cam_forward[0], cam_forward[1], 0], np.float32)
			cam_dir /= np.linalg.norm(cam_dir)
			
			return (cam_pos[0:2], cam_dir[0:2])
		else : return None
	else : return None


# For testing
#import pickle
##camW = 1280 ; camH = 720
##GST_STRING = \
##	'nvarguscamerasrc ! '\
##	'video/x-raw(memory:NVMM), width={capture_width}, height={capture_height}, format=(string)NV12, framerate=(fraction){fps}/1 ! '\
##	'nvvidconv ! '\
##	'video/x-raw, width=(int){width}, height=(int){height}, format=(string)BGRx ! '\
##	'videoconvert ! '\
##	'video/x-raw, format=(string)BGR ! '\
##	'appsink'.format(
##			width=camW,
##			height=camH,
##			fps=30,
##			capture_width=camW,
##			capture_height=camH
##	)
##cap = util.VideoCapture(GST_STRING, cv2.CAP_GSTREAMER)
#cap = cv2.VideoCapture(0)
#cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)
#CAMERADATA_FILENAME = "laptopcam_fisheye_params_2"
#print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
#with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)
#ids, corners = util.getGridMarkers(5, 8, 0.014, 0.014)
#dictio = aruco.Dictionary_get(aruco.DICT_6X6_250)
#board = aruco.Board_create(corners[:10], dictio, ids[:10])
#def loop():
#	while True:
#		
#		image = util.fisheye_undistort(cameradata, cap.read()[1])
#		
#		res = getBoardTransform(cameradata, image, board, dictio)
#		
#		cv2.imshow("image", cv2.resize(image, (700, 600)))
#		#cv2.imshow("image tordue", cv2.resize(cap.read()[1], (700, 600)))
#		
#		if cv2.waitKey(round(1000/30)) == ord('q') : return 
#loop()
#board.ids = ids ; board.corners = corners
#loop()

# TODO:
# - try to reuse last tvec,rvec as guess for pos. estimation ?
