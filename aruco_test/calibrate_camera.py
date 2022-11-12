import cv2.aruco as aruco
import pickle
import os

from util import * # util.py


aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
aruco_params = aruco.DetectorParameters_create()
charuco_cell_size = 0.104/3 # in meters, must be measured from the printed board and modified accordingly
charuco_board = aruco.CharucoBoard_create(6, 8, charuco_cell_size, charuco_cell_size/2, aruco_dict)

# generate charuco board image
#cv2.imwrite('calibration_board-6X6_250.jpg', charuco_board.draw([400, 800]))
#print("Created calibration board image")

# generate calibration data
httpvideo = HTTPVideoStream("http://192.168.1.7:8080/video/mjpeg")

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
	videoframe = httpvideo.getFrameImg()
	cv2.imshow('videostream', videoframe)
	
	clicked = cv2.waitKey(1) 
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
