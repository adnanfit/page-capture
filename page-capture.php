<?php
/*
Plugin Name: Simple Page Capture Button
Description: Adds floating capture button and shortcode for page capture with PDF support
Version: 1.1
Author: M Adnan Ajmal
Author URI: Your URI
Text Domain: simple-page-capture
Domain Path: /languages
*/

// Prevent direct access
if (!defined('ABSPATH')) {
    exit('Direct access denied.');
}

// Define plugin constants
define('SPC_VERSION', '1.1');
define('SPC_PLUGIN_DIR', plugin_dir_path(__FILE__));
define('SPC_PLUGIN_URL', plugin_dir_url(__FILE__));

class SimplePageCapture {
    private static $instance = null;

    public static function getInstance() {
        if (null === self::$instance) {
            self::$instance = new self();
        }
        return self::$instance;
    }

    private function __construct() {
        // Initialize plugin
        add_action('init', array($this, 'init'));
        
        // Register scripts and styles
        add_action('wp_enqueue_scripts', array($this, 'registerAssets'));
        
        // Add shortcode
        add_shortcode('print_button', array($this, 'renderCaptureButton'));
        
        // Add floating button
        add_action('wp_footer', array($this, 'addFloatingButton'));
        
        // Add admin menu
        add_action('admin_menu', array($this, 'addAdminMenu'));
    }

    public function init() {
        // Load text domain for translations
        load_plugin_textdomain('simple-page-capture', false, dirname(plugin_basename(__FILE__)) . '/languages');
    }

    public function registerAssets() {
        // Register scripts
        wp_register_script('html2canvas', 
            'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js',
            array('jquery'),
            '1.4.1',
            true
        );

        wp_enqueue_script(
            'jspdf',
            'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js',
            array(),
            '2.5.1',
            true
        );

        wp_register_script('html2pdf',
            'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
            array('jspdf'),
            '0.10.1',
            true
        );

        // Register and localize main script
        wp_register_script(
            'capture-button-script',
            SPC_PLUGIN_URL . 'js/capture.js',
            array('jquery', 'html2canvas', 'jspdf', 'html2pdf'),
            SPC_VERSION,
            true
        );

        // Add translations and settings to script
        wp_localize_script('capture-button-script', 'spcSettings', array(
            'ajaxUrl' => admin_url('admin-ajax.php'),
            'nonce' => wp_create_nonce('spc_nonce'),
            'i18n' => array(
                'capturing' => __('Capturing...', 'simple-page-capture'),
                'converting' => __('Converting to PDF...', 'simple-page-capture'),
                'complete' => __('Capture Complete!', 'simple-page-capture'),
                'downloadPng' => __('Download as PNG', 'simple-page-capture'),
                'downloadPdf' => __('Download as PDF', 'simple-page-capture'),
                'error' => __('Error occurred. Please try again.', 'simple-page-capture')
            )
        ));

        // Register styles
        wp_register_style(
            'capture-button-style',
            SPC_PLUGIN_URL . 'css/style.css',
            array(),
            SPC_VERSION
        );

        // Enqueue all registered assets
        wp_enqueue_script('capture-button-script');
        wp_enqueue_style('capture-button-style');
    }

    public function renderCaptureButton($atts = array(), $content = null) {
        // Parse and merge attributes
        $defaults = array(
            'class' => '',
            'text' => __('Print Page', 'simple-page-capture'),
            'icon' => true
        );
        
        $atts = wp_parse_args($atts, $defaults);
        
        // Sanitize attributes
        $class = esc_attr($atts['class']);
        $text = esc_html($atts['text']);
        $button_id = 'capture-button-' . wp_rand();
        
        // Build button HTML
        $icon_html = $atts['icon'] ? sprintf(
            '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24">
                <path fill="currentColor" d="M19 8h-1V3H6v5H5c-1.66 0-3 1.34-3 3v6h4v4h12v-4h4v-6c0-1.66-1.34-3-3-3zM8 5h8v3H8V5zm8 14H8v-4h8v4zm4-4h-2v-2H6v2H4v-4c0-.55.45-1 1-1h14c.55 0 1 .45 1 1v4z"/>
                <circle fill="currentColor" cx="18" cy="11.5" r="1"/>
            </svg>' 
        ) : '';
        
        return sprintf(
            '<button id="%1$s" class="capture-button-inline %2$s" title="%3$s">
                %4$s
                <span>%5$s</span>
            </button>',
            esc_attr($button_id),
            esc_attr($class),
            esc_attr__('Capture this page', 'simple-page-capture'),
            $icon_html,
            $text
        );
    }

    public function addFloatingButton() {
        // Check if floating button is enabled in settings
        if (get_option('spc_enable_floating_button', true)) {
            ?>
<div id="capture-button" title="<?php esc_attr_e('Capture this page', 'simple-page-capture'); ?>">
    <svg viewBox="0 0 24 24" width="24" height="24">
        <path fill="currentColor"
            d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z" />
        <path fill="currentColor"
            d="M20 4h-3.17L15 2H9L7.17 4H4c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 14H4V6h4.05l1.83-2h4.24l1.83 2H20v12z" />
    </svg>
</div>
<?php
        }
    }

    public function addAdminMenu() {
        add_options_page(
            __('Page Capture Settings', 'simple-page-capture'),
            __('Page Capture', 'simple-page-capture'),
            'manage_options',
            'simple-page-capture',
            array($this, 'renderSettingsPage')
        );
        
        // Register settings
        register_setting('spc_options', 'spc_enable_floating_button');
        register_setting('spc_options', 'spc_default_button_text');
    }

    public function renderSettingsPage() {
        // Add settings page HTML here if needed
    }

    // Activation hook
    public static function activate() {
        // Set default options
        add_option('spc_enable_floating_button', true);
        add_option('spc_default_button_text', __('Print Page', 'simple-page-capture'));
        
        // Clear permalinks
        flush_rewrite_rules();
    }

    // Deactivation hook
    public static function deactivate() {
        // Cleanup if needed
        flush_rewrite_rules();
    }
}

// Initialize plugin
function SimplePageCapture() {
    return SimplePageCapture::getInstance();
}

// Start the plugin
add_action('plugins_loaded', 'SimplePageCapture');

// Register activation and deactivation hooks
register_activation_hook(__FILE__, array('SimplePageCapture', 'activate'));
register_deactivation_hook(__FILE__, array('SimplePageCapture', 'deactivate'));