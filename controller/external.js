const express = require("express");
const router = express.Router();
const path = require("path");
const fs = require("fs");
const { broadcastDeviceData } = require("../websocket/broadcaster");
const {Pet} = require("../models");
const {Device} = require("../models");

// 디바이스별 활성 파일명과 마지막 데이터 수신 시간을 저장
const deviceSessions = new Map();
const SESSION_TIMEOUT = 60000; // 60초 동안 데이터 없으면 세션 종료

router.post("/device", async (req, res) => {
    const now = new Date();

    // 디바이스 데이터 파싱 및 CSV 저장
    try {
        // 데이터 폴더 확인 및 생성
        const dataDir = path.join(__dirname, "..", "data");
        if (!fs.existsSync(dataDir)) {
            fs.mkdirSync(dataDir, { recursive: true });
        }

        // 단일 디바이스 또는 여러 디바이스 처리
        let devicesArray = [];

        if (req.body.devices && Array.isArray(req.body.devices)) {
            // 여러 디바이스
            devicesArray = req.body.devices;
        } else if (req.body.deviceAddress && req.body.deviceData) {
            // 단일 디바이스
            devicesArray = [{
                deviceAddress: req.body.deviceAddress,
                deviceData: req.body.deviceData
            }];
        } else {
            return res.status(400).send("잘못된 데이터 형식");
        }

        // CSV 파일 저장 시작 시간
        // const saveStartTime = Date.now();

        // 각 디바이스별로 CSV 저장
        const devicesData = [];
        for (const device of devicesArray) {
            const { deviceAddress, deviceData } = device;
            // console.log("device : ",device);
            // const petInfos = await Pet.findAll();
            // console.log("petInfos : ", petInfos);
            const petInfo = await Pet.findOne({where: {device_address : deviceAddress}});
            if (!petInfo) {
                return res.status(400).send("펫 정보를 찾을 수 없습니다.");
            }
            
            const petName = petInfo.name;
            console.log("petName : ", petName);
            const deviceName = deviceAddress.replace(/:/g, '-');
            const currentTime = Date.now();

            // 디바이스 세션 확인
            let session = deviceSessions.get(deviceAddress);

            // 세션이 없거나 타임아웃된 경우 새 세션 시작
            if (!session || (currentTime - session.lastUpdate > SESSION_TIMEOUT)) {
                // 서울 시간대로 변환하여 YYYYMMDD_HHMMSS 형식으로 생성
                const formatter = new Intl.DateTimeFormat('en-US', {
                    timeZone: 'Asia/Seoul',
                    year: 'numeric',
                    month: '2-digit',
                    day: '2-digit',
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit',
                    hour12: false
                });
                const parts = formatter.formatToParts(now);
                const year = parts.find(p => p.type === 'year').value;
                const month = parts.find(p => p.type === 'month').value;
                const day = parts.find(p => p.type === 'day').value;
                const hour = parts.find(p => p.type === 'hour').value;
                const minute = parts.find(p => p.type === 'minute').value;
                const second = parts.find(p => p.type === 'second').value;
                const millisecond = String(now.getMilliseconds()).padStart(3, '0');
                const fileDate = `${year}${month}${day}_${hour}${minute}${second}`;
                const timestamp = `${hour}:${minute}:${second}:${millisecond}`;

                const fileName = `${petName}_${deviceName}_${fileDate}.csv`;
                session = {
                    fileName: fileName,
                    lastUpdate: currentTime,
                    timestamp,
                };
                deviceSessions.set(deviceAddress, session);
            } else {
                // 기존 세션 업데이트
                session.lastUpdate = currentTime;
            }

            const fileDir = path.join(__dirname, "..", "data", deviceName);
            if (!fs.existsSync(fileDir)) {
                fs.mkdirSync(fileDir, { recursive: true });
            }
            // 파일명 생성 (디바이스주소_날짜시분초.csv)
            const fileName = session.fileName;
            
            const filePath = path.join(dataDir, deviceName, fileName);

            // 파일이 존재하는지 확인
            const fileExists = fs.existsSync(filePath);

            // CSV 데이터 생성
            let csvContent = "";

            // 파일이 없으면 헤더 추가
            if (!fileExists) {
                csvContent += "timestamp,cnt,ir,red,green,spo2,hr,temp,battery\n";
            }

            // 데이터 추가
            csvContent += deviceData.map(row => `${session.timestamp},${row}`).join("\n") + "\n";

            // CSV 파일에 데이터 추가 (append mode)
            fs.appendFileSync(filePath, csvContent, 'utf8');

            // 웹소켓 전송을 위한 데이터 수집
            devicesData.push({
                deviceAddress,
                deviceData
            });
        }

        // CSV 파일 저장 종료 시간
        // const saveEndTime = Date.now();
        // const saveTime = saveEndTime - saveStartTime;

        // 웹소켓으로 모든 디바이스 데이터 브로드캐스트
        const wsStats = broadcastDeviceData(devicesData);
 
        res.send("ok");
    } catch (error) {
        console.error("CSV 저장 중 오류:", error);
        res.status(500).send("데이터 저장 실패");
    }
});

module.exports = router;

