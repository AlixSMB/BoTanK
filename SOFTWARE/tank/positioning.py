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
print(f"Charuco cell size set as {charuco_cell_size} m")
charuco_nbcells_w = 6 # the order is 
charuco_nbcells_h = 8 # important here !
print(f"Charuco board has dimensions {charuco_nbcells_w}x{charuco_nbcells_h} cells")
aruco_dict = aruco.Dictionary_get(aruco.DICT_6X6_250)
aruco_params = aruco.DetectorParameters_create()
charuco_board = aruco.CharucoBoard_create(charuco_nbcells_w, charuco_nbcells_h, charuco_cell_size, charuco_cell_size/2, aruco_dict)


def getWorldTransform(videoframe):
	corners, ids, _ = aruco.detectMarkers(videoframe, aruco_dict, parameters=detect_params)
	if ids is not None:
		try:
			nb_charuco, charuco_corners, charuco_ids = aruco.interpolateCornersCharuco(corners, ids, videoframe, charuco_board, cam_matrix, cam_coeffs)
			if nb_charuco == 0 : return None
		except : return None
		else:
			try:
				foundpos, rvec, tvec = aruco.estimatePoseCharucoBoard( charuco_corners, charuco_ids, charuco_board, cam_matrix, cam_coeffs, None, None, False )
				if not foundpos : return None
				else : return (rvec, tvec)
			except : return None
	else : return None


# For testing
#while True:
#	_, videoframe = cap.read()
#	#undistort_frame = cv2.undistort(videoframe, cam_matrix, cam_coeffs)
#	
#	corners, ids, _ = aruco.detectMarkers(videoframe, aruco_dict, parameters=detect_params)
#	if ids is not None:
#		try:
#			nb_charuco, charuco_corners, charuco_ids = aruco.interpolateCornersCharuco(corners, ids, videoframe, charuco_board, cam_matrix, cam_coeffs)
#			if nb_charuco > 0 : videoframe = aruco.drawDetectedCornersCharuco(videoframe, charuco_corners, charuco_ids)
#		except : pass
#		else:
#			try:
#				foundpos, rvec, tvec = aruco.estimatePoseCharucoBoard( charuco_corners, charuco_ids, charuco_board, cam_matrix, cam_coeffs, None, None, False )
#				if foundpos : videoframe = cv2.drawFrameAxes(videoframe, cam_matrix, cam_coeffs, rvec, tvec, 0.1)
#			except : pass
#	
#	cv2.imshow("original", cv2.resize(videoframe, (800, round(720/1280*800))))
#	if cv2.waitKey(round(1000/30)) == ord('q') : break 


# TODO:
# - try to reuse last tvec,rvec as guess for pos. estimation ?
