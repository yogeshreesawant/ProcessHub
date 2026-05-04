// Use unique names to avoid conflicts with the library
const MY_SUPABASE_URL = 'https://ciygyijepuysmzpsxtqv.supabase.co';
const MY_SUPABASE_KEY = 'sb_publishable_TNEByRr0uYBDMqb-QiD9Cg_HiyM2is4';

// Initialize the client once
const supabaseClient = supabase.createClient(MY_SUPABASE_URL, MY_SUPABASE_KEY);

const loginForm = document.getElementById('loginForm');

if (loginForm) {
    loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const email = document.getElementById('userid').value;
        const password = document.getElementById('password').value;

        const { data, error } = await supabaseClient.auth.signInWithPassword({
            email: email,
            password: password,
        });

        if (error) {
            alert("Login failed: " + error.message);
        } else {
            alert("Login successful!");
            window.location.href = 'dashboard.html'; 
        }
    });
}

const forgotLink = document.getElementById('forgotPassword');

if (forgotLink) {
    forgotLink.addEventListener('click', async (e) => {
        e.preventDefault();
        
        const email = document.getElementById('userid').value;

        if (!email) {
            alert("Please enter your email address in the UserId field first.");
            return;
        }

        const { data, error } = await supabaseClient.auth.resetPasswordForEmail(email, {
            // The page the user is sent to after clicking the email link
            redirectTo: window.location.origin + '/reset-password.html',
        });

        if (error) {
            alert("Error: " + error.message);
        } else {
            alert("Password reset email sent! Please check your inbox.");
        }
    });
}

async function handleSignUp() {
    const name = document.getElementById('signup-name').value;
    const email = document.getElementById('signup-email').value;
    const password = document.getElementById('signup-pass').value;
    const empId = document.getElementById('signup-emp-id').value; // Get the ID from input

    if (!name || !email || !password || !empId) {
        alert("Please fill in all fields.");
        return;
    }

    // 1. Pre-check: Does this Employee ID already exist in our profiles?
    const { data: existingUser, error: checkError } = await supabaseClient
        .from('profiles')
        .select('employee_id')
        .eq('employee_id', empId)
        .maybeSingle();

    if (existingUser) {
        alert("Error: This Employee ID is already registered.");
        return;
    }

    // 2. Proceed with Sign Up
    const { data, error } = await supabaseClient.auth.signUp({
        email: email,
        password: password,
        options: {
            data: {
                full_name: name,
                employee_id: empId // This key name must match the SQL trigger: ->>'employee_id'
            }
        }
    });

    if (error) {
        alert("Error creating account: " + error.message);
    } else {
        alert("Account created successfully!");
        // Redirect to dashboard or login
        window.location.href = 'index.html';
    }
}

