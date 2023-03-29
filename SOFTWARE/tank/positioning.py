from util import Object#, HTTPVideoStream # util.py

import numpy as np
import cv2
import cv2.aruco as aruco
import pickle
import math

CAMERADATA_FILENAME = "camera_calibration_params_laptopcam"
print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)
cam_matrix = cameradata["matrix"]
cam_coeffs = cameradata["coeffs"]

detect_params = aruco.DetectorParameters_create()
aruco_cell_size = 0.05; # in meters
print(f"Aruco cell size set as {aruco_cell_size} m")
aruco_board = Object(corners=[], ids=[], dictio=aruco.Dictionary_get(aruco.DICT_6X6_250), board=None)

# make checkered grid -------------------------------------------------------------------------------
grid_nbsquares_w = 7*3 
grid_nbsquares_h = 5*3
print(f"Aruco checked grid has dimensions {grid_nbsquares_w}x{grid_nbsquares_h} cells")
aruco_cell_margin = aruco_cell_size/2 # on the 4 sides of the square cell
cs = aruco_cell_size + aruco_cell_margin*2
n=0
for i in range(grid_nbsquares_w):
	for j in range(grid_nbsquares_h):
		if i%2==0 and j%2==0 or i%2!=0 and j%2!=0 : continue
		
		aruco_board.ids.append(n)
		n+=1
		
		yt = cs*(j+1) ; yb = cs*j
		xr = cs*(i+1) ; xl = cs*i
		aruco_board.corners.append([ [xl,yt,0], [xr,yt,0], [xr,yb,0], [xl,yb,0] ]) # top left corner first, CCW order
# ----------------------------------------------------------------------------------------------------

aruco_board.board = aruco.Board_create( np.asarray(aruco_board.corners, np.float32), aruco_board.dictio, np.asarray(aruco_board.ids))

# get pos / rot of camera relative to board
def getBoardTransform(videoframe):
	corners, ids, _ = aruco.detectMarkers(videoframe, aruco_board.dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		nb_markers, rvec, tvec = aruco.estimatePoseBoard(corners, ids, aruco_board.board, cam_matrix, cam_coeffs, None, None)
		if nb_markers > 0:
			#aruco.drawDetectedMarkers(videoframe, corners, ids)
			cv2.drawFrameAxes(videoframe, cam_matrix, cam_coeffs, rvec, tvec, aruco_cell_size*3) 
			
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
#httpvideo = HTTPVideoStream('192.168.1.7', '8080', '/video/mjpeg')
#cap = cv2.VideoCapture(0)
#cap.set(cv2.CAP_PROP_EXPOSURE, -7)
#while True:
#	#videoframe = cv2.imdecode( np.frombuffer(httpvideo.getFrameImg(), dtype=np.uint8), cv2.IMREAD_COLOR)
#	_, videoframe = cap.read()
#	#undistort_frame = cv2.undistort(videoframe, cam_matrix, cam_coeffs)
#	
#	res = getBoardTransform(videoframe)
#	if res is not None:
#		print(res[1]*180/math.pi)
#	
#	cv2.imshow("original", videoframe)
#	if cv2.waitKey(round(1000/30)) == ord('q') : break 


# TODO:
# - try to reuse last tvec,rvec as guess for pos. estimation ?
