import numpy as np
import cv2
import cv2.aruco as aruco
import pickle


CAMERADATA_FILENAME = "camera_calibration_params_laptopcam"
print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)
cam_matrix = cameradata["matrix"]
cam_coeffs = cameradata["coeffs"]

aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
detect_params = aruco.DetectorParameters_create()

charuco_cell_size = 0.05; # in meters
print(f"Aruco cell size set as {charuco_cell_size} m, make sure this is correct !")
charuco_nbcells_w = 8
charuco_nbcells_h = 6
aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
aruco_params = aruco.DetectorParameters_create()
charuco_board = aruco.CharucoBoard_create(charuco_nbcells_w, charuco_nbcells_h, charuco_cell_size, charuco_cell_size/2, aruco_dict)

cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)  # get max. res
cap.set(cv2.CAP_PROP_FRAME_HEIGHT, 10000) # of camera
print(f"Video res.: {cap.get(cv2.CAP_PROP_FRAME_WIDTH)}x{cap.get(cv2.CAP_PROP_FRAME_HEIGHT)}")

while True:
	_, videoframe = cap.read()
	#undistort_frame = cv2.undistort(videoframe, cameradata["matrix"], cameradata["coeffs"])
	
	corners, ids, _ = aruco.detectMarkers(videoframe, aruco_dict, parameters=detect_params)
	if ids is not None:
		_, charuco_corners, charuco_ids = aruco.interpolateCornersCharuco(corners, ids, videoframe, charuco_board)
		res, rvec, tvec = aruco.estimatePoseCharucoBoard(charuco_corners, charuco_ids, charuco_board, cam_matrix, cam_coeffs, None, None, False)
		if res: 
			videoframe = cv2.drawFrameAxes(videoframe, cam_matrix, cam_coeffs, rvec, tvec, 0.1)
	
	videoframe = aruco.drawDetectedMarkers(videoframe, corners, ids)
	
	
	cv2.imshow("original", cv2.resize(videoframe, (800, round(720/1280*800))))
	if cv2.waitKey(round(1000/30)) == ord('q') : break 
