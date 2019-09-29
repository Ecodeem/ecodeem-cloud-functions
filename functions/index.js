const functions = require('firebase-functions');
const admin = require('firebase-admin');
const express = require('express');
const bodyParser = require("body-parser");
admin.initializeApp(functions.config().firebase);
let db = admin.firestore();
let usersRef = db.collection('users');
let contactsRef = db.collection('contacts');


const app = express();
const main = express();

main.use('/api/v1', app);
main.use(bodyParser.json());

const parseContacts = async (contacts) => {
    try {
        const newContacts = [];
        const queries = contacts.map((f) => usersRef.where('phone', '<=', f.phone).limit(1).get());
        const request = await Promise.all(queries);
        request.map((doc) => {
            if (doc.empty) return null;
            return newContacts.push({
                avatar: doc.docs[0].data().avatar || "",
                display_name: doc.docs[0].data().username || "",
                email: doc.docs[0].data().email || "",
                ecodeem_id: doc.docs[0].data().ecodeem_id || "",
                phone: doc.docs[0].data().phone || "",
                username: doc.docs[0].data().username || ""
            });
        });
        return newContacts;
    } catch (error) {
        return console.log(error);
    }

}

app.post('/parseContacts', async (req, res) => {
    try {
        // read contacts
        const { contacts, user_id } = req.body;

        const parsedContacts = await parseContacts(contacts);
        if (parsedContacts.length > 0) {
            await contactsRef.where("user_id", '==', user_id).get().then((querySnapshot) => {
                return querySnapshot.forEach(async (doc) => {
                    doc.data
                    return await doc.ref.delete();
                });
            });
            await parsedContacts.forEach(async (contact_info) => {
                console.log(user_id, JSON.stringify(contact_info));
                await contactsRef.add({
                    user_id: user_id,
                    contact_information: contact_info,
                });
            });
        }
        // fetch users that match each contact
        // update to user object of his contacts
        return res.json({
            success: true,
            message: "processing initiated"
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        });
    }
});

app.get('/', async (req, res) => {
    res.json({
        success: true,
        message: "application online"
    });
})

exports.webApi = functions.https.onRequest(main);
