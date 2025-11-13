require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const mongoose = require('mongoose');
const nodemailer = require('nodemailer');
const path = require('path');
const { google } = require('googleapis');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// MongoDB
mongoose.connect(process.env.MONGO_URI, { useNewUrlParser: true, useUnifiedTopology: true })
.then(()=>console.log("MongoDB connected"))
.catch(err=>console.error(err));

const bookingSchema = new mongoose.Schema({
    name: String,
    email: String,
    phone: String,
    date: String,
    time: String,
    createdAt: { type: Date, default: Date.now }
});
const Booking = mongoose.model('Booking', bookingSchema);

// Nodemailer
const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
});

// Google Calendar
const oAuth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    process.env.GOOGLE_REDIRECT_URI
);
oAuth2Client.setCredentials({ refresh_token: process.env.GOOGLE_REFRESH_TOKEN });
const calendar = google.calendar({ version: 'v3', auth: oAuth2Client });

// Booking route
app.post('/book', async (req, res) => {
    const { name, email, phone, date, time } = req.body;
    if(!name || !email || !phone || !date || !time) return res.status(400).send("All fields required");
    try {
        const booking = new Booking({ name, email, phone, date, time });
        await booking.save();

        // Send Email
        await transporter.sendMail({
            from: `"SmileCare Booking" <${process.env.EMAIL_USER}>`,
            to: process.env.ADMIN_EMAIL,
            subject: "New Dental Appointment Booking",
            html: `<h3>New Appointment</h3>
                   <p><strong>Name:</strong> ${name}</p>
                   <p><strong>Email:</strong> ${email}</p>
                   <p><strong>Phone:</strong> ${phone}</p>
                   <p><strong>Date:</strong> ${date}</p>
                   <p><strong>Time:</strong> ${time}</p>`
        });

        // Google Calendar Event
        const startDateTime = new Date(`${date}T${time.split(' ')[0]}:00`);
        const endDateTime = new Date(startDateTime.getTime() + 60*60*1000);
        await calendar.events.insert({
            calendarId: 'primary',
            resource: {
                summary: `Dental Appointment - ${name}`,
                description: `Phone: ${phone}, Email: ${email}`,
                start: { dateTime: startDateTime.toISOString() },
                end: { dateTime: endDateTime.toISOString() }
            }
        });

        res.redirect('/thankyou.html');
    } catch(err) {
        console.error(err);
        res.status(500).send("Error booking appointment");
    }
});

app.listen(PORT, ()=>console.log(`Server running on port ${PORT}`));