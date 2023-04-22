import util # util.py
Object = util.Object

import numpy as np
import cv2
import cv2.aruco as aruco
import math

detect_params = aruco.DetectorParameters_create()

# generate corners and ids for grid type board
def init_gridboard(grid_nbsquares_w, grid_nbsquares_h, aruco_cell_size)
	aruco_board = Object(corners=[], ids=[], dictio=aruco.Dictionary_get(aruco.DICT_6X6_250), board=None)
	
	aruco_cell_size = 0.014; # in meters
	print(f"Aruco cell size set as {aruco_cell_size} m")
	grid_nbsquares_w = 8#7*3 
	grid_nbsquares_h = 5#5*3
	print(f"Aruco checked grid has dimensions {grid_nbsquares_w}x{grid_nbsquares_h} cells")
	
	aruco_board.ids, aruco_board.corners = util.getGridMarkers(grid_nbsquares_w, grid_nbsquares_h, aruco_cell_size, aruco_cell_size)
	aruco_board.board = aruco.Board_create(aruco_board.corners, aruco_board.dictio, aruco_board.ids)
	
	return aruco_board

# generate corners and isd automatically from frames, using relative distances between markers
def auto_make_board(videoframe, board):
	pass

# get pos / rot of camera relative to board, the video frame should be distorsion free ! 
def getBoardTransform(cameradata, videoframe):
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, aruco_board.dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		
		corners, ids, _,_ = aruco.refineDetectedMarkers(videoframe, aruco_board.board, corners, ids, rejectedCorners)
		nb_markers, rvec, tvec = aruco.estimatePoseBoard(corners, ids, aruco_board.board, cameradata['matrix'], cameradata['coeffs'], None, None)
		
		if nb_markers > 0:
			aruco.drawDetectedMarkers(videoframe, corners, ids)
			cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvec, tvec, aruco_cell_size*3)
			
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
'''
camW = 1280 ; camH = 720
GST_STRING = \
	'nvarguscamerasrc ! '\
	'video/x-raw(memory:NVMM), width={capture_width}, height={capture_height}, format=(string)NV12, framerate=(fraction){fps}/1 ! '\
	'nvvidconv ! '\
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
#cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)
#import glob
#for image_test in glob.glob('test_images/*.jpg'):
while True:
	#image = cv2.imread(image_test)
	#image = util.fisheye_undistort(cameradata, cv2.cvtColor(cv2.imread(image_test), cv2.COLOR_BGR2GRAY))
	if 'K' in cameradata: # fisheye
		image = util.fisheye_undistort(cameradata, cap.read()[1])
	else : image = cap.read()[1]
	
	res = getBoardTransform(image)
	if res is not None:
		print(math.atan2(res[1][1], res[1][0])*180/math.pi)
	
	cv2.imshow("image", cv2.resize(image, (700, 600)))
	#cv2.imshow("image tordue", cv2.resize(cap.read()[1], (700, 600)))
	if cv2.waitKey(round(1000/30)) == ord('q') : break 

'''
# TODO:
# - try to reuse last tvec,rvec as guess for pos. estimation ?
