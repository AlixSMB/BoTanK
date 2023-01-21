import numpy as np
import cv2
import cv2.aruco as aruco
import pickle
import os

from util import * # util.py


# generate charuco board

# HP laptop screen
#PPM = 1366/0.310 # pixels/m
# Asus display
PPM = 1920/0.476 # pixels/m

print(f"Pixels/meter set to {PPM}, make sure this is correct !")
charuco_cell_size = 0.05; # in meters
print(f"Aruco cell size set as {charuco_cell_size} m, make sure this is correct !")
charuco_cell_psize = charuco_cell_size * PPM # in pixels
charuco_nbcells_w = 7
charuco_nbcells_h = 5
aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
aruco_params = aruco.DetectorParameters_create()
charuco_board = aruco.CharucoBoard_create(charuco_nbcells_w, charuco_nbcells_h, charuco_cell_psize, charuco_cell_psize/2, aruco_dict)

charuco_boardimg = charuco_board.draw( [round(charuco_nbcells_w*charuco_cell_psize), round(charuco_nbcells_h*charuco_cell_psize)] )
#cv2.imwrite('calibration_board-6X6_250.jpg', charuco_board.draw([400, 800]))
#print("Created calibration board image file")

# generate calibration data
#httpvideo = HTTPVideoStream('192.168.1.173', 8080, '/video/mjpeg')
cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)  # get max. res
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 10000) # of camera
print(f"Video res.: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")

print("Take some shots of the calibration board from different angles:\n's' to take a shot, 'q' to stop")
nbshots = 0

keys = ['q', 's']
keys_clicked = {}
for key in keys : keys_clicked[ord(key)] = False
lastclicked = -1

corners_shots = None
ids_shots = None
nbmarkers_shots = []

start = True
while True:
	#videoframe = cv2.imdecode(np.frombuffer(httpvideo.getFrameImg(), dtype=np.uint8), cv2.IMREAD_COLOR)
	_, videoframe = cap.read()
	cv2.imshow('videostream', videoframe)
	cv2.imshow('charucoboard', charuco_boardimg)
	
	clicked = cv2.waitKey(round(1000/30)) 
	for keycode in keys_clicked:
		if keycode == clicked and lastclicked != clicked: 
			keys_clicked[keycode] = True
		else :
			keys_clicked[keycode] = False
	lastclicked = clicked
		
	if keys_clicked[ord('q')] : break
	elif keys_clicked[ord('s')] : # take shot
		
		corners, ids, *_ = aruco.detectMarkers(videoframe, aruco_dict, parameters=aruco_params)
		if not ids is None: 
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
cv2.destroyAllWindows()

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
