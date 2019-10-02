const functions = require('firebase-functions');
const admin = require('firebase-admin');
const mongodb = require('mongodb');
const express = require('express');
const bodyParser = require("body-parser");
const cors = require('cors');
admin.initializeApp(functions.config().firebase);
const db = admin.firestore();
const usersRef = db.collection('users');
const contactsRef = db.collection('contacts');
const messageRef = db.collection('messages');
const chatsRef = db.collection('chats');


const app = express();
const main = express();

main.use(cors());
main.use('/api/v1', app);
main.use(bodyParser.json());

// contacts and db parser function
const parseContacts = async (contacts, user_id) => {
    try {
        const user_info = await usersRef.doc(user_id).get();
        // array holder for final contact values
        const newContacts = [];
        // create query for each contact
        const queries = contacts.map((f) => usersRef.where('generatedPhones', 'array-contains', f.phone).limit(1).get());
        // dispatch all queries concurrently
        const request = await Promise.all(queries);
        // create new contact instance and push to holder variable
        request.map((doc, i) => {
            if (doc.empty) return null;
            if (user_info.data().generatedPhones.includes(doc.docs[0].data().phone)) return null;
            return newContacts.push({
                avatar: doc.docs[0].data().avatar || "",
                display_name: contacts[i].display_name || doc.docs[0].data().username,
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

const syncContacts = async (contacts, user_id) => {
    // prepare new contacts function
    const parsedContacts = await parseContacts(contacts, user_id);
    if (parsedContacts.length > 0) {
        // delete all old contacts registered for a user
        await contactsRef.where("user_id", '==', user_id).get().then((querySnapshot) => {
            return querySnapshot.forEach(async (doc) => {
                await doc.ref.delete();
            });
        });
        // create new instances for already prepared contacts
        await parsedContacts.forEach(async (contact_info) => {
            await contactsRef.doc().set({
                user_id: user_id,
                ...contact_info,
            }, { merge: true });
        });
    }
}

// route to parse contacts
app.post('/parseContacts', async (req, res) => {
    try {
        const { contacts, user_id } = req.body;

        if (contacts.length < 3) {
            syncContacts(contacts, user_id);
        } else {
            const remainingNo = contacts.length % 3;
            const quotient = (contacts.length - remainingNo) / 3;
            const promises = [
                syncContacts([...contacts.slice(0, quotient)], user_id),
                syncContacts([...contacts.slice(quotient, quotient * 2)], user_id),
                syncContacts([...contacts.slice(quotient * 2, (quotient * 3) + 1)], user_id),
            ];

            // if there are reminants
            if (remainingNo > 0) {
                remainingElements = [];
                for (let index = 1; index <= remainingNo; index++) {
                    remainingElements.push(contacts[i]);
                }
                promises.push(syncContacts([...remainingElements], user_id));
            }
            await Promise.all([...promises]);
        }
        // final response
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

// route to signup new user
app.post("/signup", async (req, res) => {
    try {
        const { country, ecodeem_id, email, phone, username, avatar, generatedPhones } = req.body;
        await usersRef.doc(ecodeem_id).set({
            conversations: [],
            avatar: avatar,
            country: country,
            ecodeem_id: ecodeem_id,
            email: email,
            last_seen: new Date().now(),
            online: true,
            phone: phone,
            username: username,
            generatedPhones: generatedPhones
        });
        return res.json({
            success: true,
            message: "user created"
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        });
    }
});

// route to update user details
app.put("/update", async (req, res) => {
    try {
        const { country, ecodeem_id, email, phone, username, avatar } = req.body;
        await usersRef.doc(ecodeem_id).update({
            ecodeem_id: ecodeem_id,
            avatar: avatar,
            country: country,
            email: email,
            last_seen: new Date().now(),
            online: true,
            phone: phone,
            username: username,
        });
        return res.json({
            success: true,
            message: "user updated"
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        })
    }
});

// route to delete existing user
app.delete("/delete/:ecodeem_id", async (req, res) => {
    try {
        const { ecodeem_id } = req.params;
        await usersRef.doc(ecodeem_id).delete();
        return res.json({
            success: true,
            message: "user deleted"
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        })
    }
});

//route to switch status
app.get("/users/:user_id/status/:status", async (req, res) => {
    try {
        const { user_id, status } = req.params;
        await usersRef.doc(user_id).update({
            online: status === 'online' ? true : false,
            last_seen: new Date().now()
        });
        return res.json({
            success: true,
            message: 'user status changed'
        });
    } catch (error) {
        console.log(error);
        return res.json({
            success: false,
            error: error
        });
    }
})

// route for status check on function
app.get('/', async (req, res) => {
    res.json({
        success: true,
        message: "application online"
    });
})

exports.webApi = functions.runWith({
    timeoutSeconds: 540,
    memory: '2GB'
}).https.onRequest(main);


const prepareLastMessage = (message_data) => {
    switch (message_data.type) {
        case "text":
            return message_data.text;
        case "image":
            return "Image received";
        case "video":
            return "Video received";
        case "post":
            return "Ecodeem post received";
        default:
            return "Message received";
    }
}

// listener for chat changes to update user conversations
exports.syncSingleChatWithConversations = functions.firestore.document('message/{message_id}').onCreate((change, context) => {
    const chat_id = change.data().chat_id;
    const type = change.data().type;
    if (type === 'single') {
        const usersArray = chat_id.split("-");
        usersArray.forEach(async (user, index) => {
            const otherUser = await usersRef.doc(usersArray[index === 0 ? 1 : 0]).get();
            await usersRef.doc(user).update({
                conversations: admin.firestore.FieldValue.arrayUnion({
                    chat_id: chat_id,
                    user_id: usersArray[index === 0 ? 1 : 0],
                    date: new Date().now(),
                    last_message: prepareLastMessage(change.data()),
                }),
            });
        });
    }

});
