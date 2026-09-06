#!/bin/bash
cd /home/ubuntu/shahworks
sed -i 's|EMAIL_FROM="onboarding@resend.dev"|EMAIL_FROM="noreply@shahworks.com"|' .env
grep EMAIL_FROM .env
