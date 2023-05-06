import numpy as np
import cv2
import cv2.aruco as aruco
import pickle

from util import Object, fisheye_undistort


cap = cv2.VideoCapture(0)
cap.set(cv2.CAP_PROP_FRAME_WIDTH, 10000)

CAMERADATA_FILENAME = "laptopcam_fisheye_params_3"
print(f"Reading camera calibration params from \"{CAMERADATA_FILENAME}\"")
with open(CAMERADATA_FILENAME, "rb") as filecamera : cameradata = pickle.load(filecamera)


dictio = aruco.Dictionary_get(aruco.DICT_6X6_250)
detect_params = aruco.DetectorParameters_create()
estimate_param = aruco.EstimateParameters.create()
estimate_param.pattern = aruco.CW_top_left_corner


transfo = None
while True:
	videoframe = fisheye_undistort(cameradata, np.copy(cap.read()[1]))
	
	corners, ids, rejectedCorners = aruco.detectMarkers(videoframe, dictio, parameters=detect_params)
	if ids is not None and len(corners) > 0:
		aruco.drawDetectedMarkers(videoframe, corners, ids)
		
		rvecs, tvecs, objpoints = aruco.estimatePoseSingleMarkers(corners, 0.035, cameradata['matrix'], cameradata['coeffs']) 
		for i in range(len(ids)) :
			cv2.drawFrameAxes(videoframe, cameradata['matrix'], cameradata['coeffs'], rvecs[i], tvecs[i], 0.02)
	
	cv2.imshow("image", videoframe)
	keycode = cv2.waitKey(round(1000/30))
	if keycode == ord('q') : break


# TODO: 
# try ransac
# try auto make board error correction -> compute reprojection error, 
# calibrate cam with lcd, 
# try perpendicular markers instead of horizontal
