#include <Stepper.h>

int btn_rota = 3;
int btn_canon = 2;

int pot = A3;

int pos = 0;
float conver = 0;
float pos_can = 0;

// Defines the number of steps per rotation
const int tir = 4750;

// Creates an instance of stepper class
// Pins entered in sequence IN1-IN3-IN2-IN4 for proper step sequence
Stepper myStepper_tir = Stepper(stepsPerRevolution, 4, 5, 6, 7);
Stepper myStepper_canon = Stepper(stepsPerRevolution, 8, 10, 9, 11);

void setup() {
  pinMode(btn_rota, INPUT);
  pinMode(btn_canon, INPUT);
  pinMode(pot, INPUT);

  Serial.begin(9600);
}

void loop() {
  
  pos = analogRead(pot);
  conver = pos - 511;
  pos_can = conver / 1023 * 1000;

  Serial.println(pos_can);
  Serial.println(" ");

  // Rotate CCW quickly at 10 RPM
  if (digitalRead(btn_canon) == HIGH) {
    myStepper_tir.setSpeed(5);
    myStepper_tir.step(tir);
  }

  if (digitalRead(btn_rota) == HIGH) {
    myStepper_canon.setSpeed(5);
    myStepper_canon.step(pos_can);
  }
}
